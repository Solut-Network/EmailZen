/**
 * Service Worker - Processamento em background
 * Processa emails automaticamente e gerencia exclusões
 */

import { obterRegras, salvarEstatisticas, adicionarHistorico, salvarRegra } from '../utils/storage.js';
import { 
  buscarMensagens, 
  obterMensagem, 
  modificarMensagem, 
  excluirMensagem,
  obterLabels,
  criarLabel,
  mensagemCorrespondeRegra,
  processarMensagensBatch,
  analisarRemetentesFrequentes
} from '../utils/gmail-api.js';
import { obterLabelsCache, salvarLabelsCache } from '../utils/storage.js';

// Cache de labels para evitar requisições desnecessárias
let labelsCache = null;
let labelsMap = {}; // Mapa nome -> id

/**
 * Inicializa cache de labels
 */
async function inicializarLabelsCache() {
  try {
    const cache = await obterLabelsCache();
    if (cache.length > 0) {
      labelsCache = cache;
      labelsMap = {};
      cache.forEach(label => {
        labelsMap[label.name] = label.id;
      });
      return;
    }
    
    // Se não tem cache, busca do Gmail
    const labels = await obterLabels();
    await salvarLabelsCache(labels);
    labelsCache = labels;
    labelsMap = {};
    labels.forEach(label => {
      labelsMap[label.name] = label.id;
    });
  } catch (error) {
    console.error('Erro ao inicializar cache de labels:', error);
  }
}

/**
 * Obtém ou cria um label
 * @param {string} nomeLabel - Nome do label
 * @returns {Promise<string>} ID do label
 */
async function obterOuCriarLabel(nomeLabel) {
  if (!labelsCache) {
    await inicializarLabelsCache();
  }
  
  if (labelsMap[nomeLabel]) {
    return labelsMap[nomeLabel];
  }
  
  // Cria novo label
  try {
    const novoLabel = await criarLabel(nomeLabel);
    labelsMap[nomeLabel] = novoLabel.id;
    labelsCache.push(novoLabel);
    await salvarLabelsCache(labelsCache);
    return novoLabel.id;
  } catch (error) {
    console.error(`Erro ao criar label ${nomeLabel}:`, error);
    throw error;
  }
}

/**
 * Processa uma mensagem aplicando regras
 * @param {string} messageId - ID da mensagem
 * @param {Array} regras - Lista de regras ativas
 * @returns {Promise<Object>} Resultado do processamento
 */
async function processarMensagem(messageId, regras) {
  try {
    const mensagem = await obterMensagem(messageId);
    
    // Encontra regras que correspondem
    const regrasCorrespondentes = regras.filter(regra => 
      mensagemCorrespondeRegra(mensagem, regra)
    );
    
    if (regrasCorrespondentes.length === 0) {
      return { processado: false, messageId };
    }
    
    // Aplica primeira regra correspondente (ou pode aplicar todas)
    const regra = regrasCorrespondentes[0];
    const modificacoes = {
      addLabelIds: [],
      removeLabelIds: []
    };
    
    // Adiciona label se especificado
    if (regra.acoes?.label) {
      const labelId = await obterOuCriarLabel(regra.acoes.label);
      modificacoes.addLabelIds.push(labelId);
    }
    
    // Marca como lido se necessário
    if (regra.acoes?.marcarLido) {
      modificacoes.removeLabelIds.push('UNREAD');
    }
    
    // Arquiva se necessário
    if (regra.acoes?.arquivar) {
      modificacoes.removeLabelIds.push('INBOX');
    }
    
    // Aplica modificações
    if (modificacoes.addLabelIds.length > 0 || modificacoes.removeLabelIds.length > 0) {
      await modificarMensagem(messageId, modificacoes);
    }
    
    await adicionarHistorico({
      acao: 'processado',
      messageId,
      regraId: regra.id,
      regraNome: regra.nome
    });
    
    return { 
      processado: true, 
      messageId, 
      regraId: regra.id,
      retencaoDias: regra.acoes?.retencaoDias
    };
  } catch (error) {
    console.error(`Erro ao processar mensagem ${messageId}:`, error);
    return { processado: false, messageId, erro: error.message };
  }
}

/**
 * Executa uma regra específica
 * @param {string} regraId - ID da regra
 * @returns {Promise<Object>} Resultado da execução
 */
async function executarRegraIndividual(regraId) {
  try {
    console.log(`[EmailZen] Executando regra: ${regraId}`);
    
    const regras = await obterRegras();
    const regra = regras.find(r => r.id === regraId);
    
    if (!regra) {
      throw new Error('Regra não encontrada');
    }
    
    if (!regra.ativa) {
      throw new Error('Regra está inativa');
    }
    
    await inicializarLabelsCache();
    
    // Busca mensagens não lidas na inbox
    console.log(`[EmailZen] Buscando mensagens para regra ${regraId}...`);
    const resultado = await buscarMensagens({
      query: 'in:inbox is:unread',
      maxResults: 100
    });
    
    if (!resultado.messages || resultado.messages.length === 0) {
      console.log(`[EmailZen] Nenhuma mensagem encontrada para regra ${regraId}`);
      return { processados: 0, total: 0 };
    }
    
    const messageIds = resultado.messages.map(m => m.id);
    console.log(`[EmailZen] Processando ${messageIds.length} mensagens para regra ${regraId}...`);
    let processados = 0;
    
    // Processa mensagens que correspondem à regra em batches menores para evitar timeout
    const batchSize = 10;
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      console.log(`[EmailZen] Processando batch ${Math.floor(i/batchSize) + 1} de ${Math.ceil(messageIds.length/batchSize)} (${batch.length} mensagens)...`);
      
      for (const messageId of batch) {
        try {
          const resultadoProcessamento = await processarMensagem(messageId, [regra]);
          if (resultadoProcessamento.processado) {
            processados++;
          }
        } catch (error) {
          console.error(`Erro ao processar mensagem ${messageId}:`, error);
        }
      }
      
      // Pequeno delay entre batches para não sobrecarregar a API
      if (i + batchSize < messageIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Atualiza estatísticas
    const { emailsProcessados = 0 } = await chrome.storage.local.get(['estatisticas']);
    await salvarEstatisticas({
      emailsProcessados: emailsProcessados + processados
    });
    
    console.log(`[EmailZen] Regra ${regraId}: ${processados} mensagens processadas de ${messageIds.length} total`);
    
    return { processados, total: messageIds.length };
    
  } catch (error) {
    console.error(`[EmailZen] Erro ao executar regra ${regraId}:`, error);
    throw error;
  }
}

/**
 * Processa emails da inbox
 */
async function processarEmails() {
  try {
    console.log('[EmailZen] Iniciando processamento de emails...');
    
    const regras = await obterRegras();
    const regrasAtivas = regras.filter(r => r.ativa);
    
    if (regrasAtivas.length === 0) {
      console.log('[EmailZen] Nenhuma regra ativa encontrada');
      return;
    }
    
    await inicializarLabelsCache();
    
    // Busca mensagens não lidas na inbox
    const resultado = await buscarMensagens({
      query: 'in:inbox is:unread',
      maxResults: 50
    });
    
    if (!resultado.messages || resultado.messages.length === 0) {
      console.log('[EmailZen] Nenhuma mensagem nova para processar');
      return;
    }
    
    const messageIds = resultado.messages.map(m => m.id);
    console.log(`[EmailZen] Processando ${messageIds.length} mensagens...`);
    
    // Processa em batches
    const resultados = await processarMensagensBatch(
      messageIds,
      (msgId) => processarMensagem(msgId, regrasAtivas),
      10
    );
    
    const processados = resultados.filter(r => r.processado).length;
    console.log(`[EmailZen] ${processados} mensagens processadas`);
    
    // Atualiza estatísticas
    const { emailsProcessados = 0 } = await chrome.storage.local.get(['estatisticas']);
    await salvarEstatisticas({
      emailsProcessados: emailsProcessados + processados
    });
    
  } catch (error) {
    console.error('[EmailZen] Erro no processamento:', error);
  }
}

/**
 * Verifica e exclui emails antigos baseado em regras de retenção
 */
async function verificarExclusoes() {
  try {
    console.log('[EmailZen] Verificando emails para exclusão...');
    
    const regras = await obterRegras();
    const regrasComRetencao = regras.filter(r => 
      r.ativa && r.acoes?.retencaoDias && r.acoes.retencaoDias > 0
    );
    
    if (regrasComRetencao.length === 0) {
      return;
    }
    
    await inicializarLabelsCache();
    
    const agora = Date.now();
    let emailsExcluidos = 0;
    
    // Para cada regra com retenção, busca emails com o label correspondente
    for (const regra of regrasComRetencao) {
      if (!regra.acoes?.label) continue;
      
      const labelId = labelsMap[regra.acoes.label];
      if (!labelId) continue;
      
      // Busca mensagens com o label
      const resultado = await buscarMensagens({
        query: `label:${regra.acoes.label}`,
        maxResults: 100
      });
      
      if (!resultado.messages || resultado.messages.length === 0) continue;
      
      // Verifica cada mensagem
      for (const msg of resultado.messages) {
        try {
          const mensagem = await obterMensagem(msg.id);
          const dataMensagem = parseInt(mensagem.internalDate);
          const diasDesdeMensagem = (agora - dataMensagem) / (1000 * 60 * 60 * 24);
          
          if (diasDesdeMensagem >= regra.acoes.retencaoDias) {
            await excluirMensagem(msg.id);
            emailsExcluidos++;
            
            await adicionarHistorico({
              acao: 'excluido',
              messageId: msg.id,
              regraId: regra.id,
              regraNome: regra.nome,
              diasRetencao: regra.acoes.retencaoDias
            });
          }
        } catch (error) {
          console.error(`Erro ao verificar mensagem ${msg.id}:`, error);
        }
      }
    }
    
    if (emailsExcluidos > 0) {
      console.log(`[EmailZen] ${emailsExcluidos} emails excluídos`);
      
      const { emailsExcluidos: total = 0 } = await chrome.storage.local.get(['estatisticas']);
      await salvarEstatisticas({
        emailsExcluidos: total + emailsExcluidos
      });
    }
    
  } catch (error) {
    console.error('[EmailZen] Erro na verificação de exclusões:', error);
  }
}

/**
 * Atualiza alarme de verificação automática baseado na configuração do usuário
 */
async function atualizarAlarmeVerificacao(ativa, intervaloMinutos) {
  // Remove alarme existente
  await chrome.alarms.clear('processarEmails');
  
  if (ativa) {
    // Cria novo alarme com intervalo configurado
    chrome.alarms.create('processarEmails', {
      periodInMinutes: intervaloMinutos
    });
    console.log(`[EmailZen] Alarme de verificação automática configurado para ${intervaloMinutos} minutos`);
  } else {
    console.log('[EmailZen] Verificação automática desativada');
  }
}

/**
 * Inicializa alarme de verificação automática na instalação/inicialização
 */
async function inicializarAlarmeVerificacao() {
  const { obterConfigVerificacao } = await import('../utils/storage.js');
  const config = await obterConfigVerificacao();
  await atualizarAlarmeVerificacao(config.ativa, config.intervaloMinutos);
}

/**
 * Listener para alarmes do Chrome
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'processarEmails') {
    console.log('[EmailZen] Alarme disparado: processando emails automaticamente...');
    processarEmails();
  } else if (alarm.name === 'verificarExclusoes') {
    verificarExclusoes();
  }
});

/**
 * Busca contador de emails para um label
 * @param {string} labelNome - Nome do label
 * @returns {Promise<number>} Contador de emails
 */
async function buscarContadorEmails(labelNome) {
  try {
    await inicializarLabelsCache();
    const labelId = labelsMap[labelNome];
    
    if (!labelId) {
      return 0;
    }
    
    const resultado = await buscarMensagens({
      query: `label:${labelNome}`,
      maxResults: 1
    });
    
    return resultado.resultSizeEstimate || 0;
  } catch (error) {
    console.error(`Erro ao buscar contador para ${labelNome}:`, error);
    return 0;
  }
}

/**
 * Analisa remetentes frequentes e retorna sugestões
 * @returns {Promise<Array>} Lista de sugestões de regras
 */
async function analisarSugestoes() {
  try {
    console.log('[EmailZen] Iniciando análise inteligente...');
    
    // Verifica regras existentes para não sugerir duplicatas
    const regrasExistentes = await obterRegras();
    const dominiosJaRegrados = new Set();
    regrasExistentes.forEach(regra => {
      if (regra.condicoes?.remetente) {
        regra.condicoes.remetente.forEach(rem => {
          const dominio = rem.startsWith('@') ? rem.substring(1) : rem.split('@')[1];
          if (dominio) dominiosJaRegrados.add(dominio.toLowerCase());
        });
      }
    });
    
    // Analisa remetentes frequentes (limite mínimo: 2 emails)
    const remetentesFrequentes = await analisarRemetentesFrequentes(2, 10);
    
    // Filtra remetentes que já têm regras
    const sugestoes = remetentesFrequentes
      .filter(r => !dominiosJaRegrados.has(r.dominio))
      .map(r => ({
        dominio: r.dominio,
        quantidade: r.quantidade,
        porcentagem: r.porcentagem,
        sugestaoLabel: r.dominio.split('.')[0] || r.dominio
      }));
    
    console.log(`[EmailZen] ${sugestoes.length} sugestões geradas`);
    
    return sugestoes;
  } catch (error) {
    console.error('[EmailZen] Erro ao analisar sugestões:', error);
    throw error;
  }
}

/**
 * Cria regra automaticamente a partir de uma sugestão
 * @param {Object} sugestao - Sugestão de regra
 * @param {Object} opcoes - Opções da regra (label, marcarLido, arquivar)
 * @returns {Promise<string>} ID da regra criada
 */
async function criarRegraAutomatica(sugestao, opcoes = {}) {
  try {
    const nomeLabel = opcoes.label || sugestao.sugestaoLabel || sugestao.dominio.split('.')[0];
    
    const regra = {
      nome: `Organizar ${sugestao.dominio}`,
      condicoes: {
        remetente: [`@${sugestao.dominio}`]
      },
      acoes: {
        label: nomeLabel,
        marcarLido: opcoes.marcarLido !== undefined ? opcoes.marcarLido : true,
        arquivar: opcoes.arquivar !== undefined ? opcoes.arquivar : false,
        retencaoDias: opcoes.retencaoDias || undefined
      },
      ativa: true
    };
    
    const regraId = await salvarRegra(regra);
    console.log(`[EmailZen] Regra criada automaticamente: ${regraId}`);
    
    return regraId;
  } catch (error) {
    console.error('[EmailZen] Erro ao criar regra automática:', error);
    throw error;
  }
}

/**
 * Listener para mensagens do content script ou popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handler para ping (verificação de atividade)
  if (request.acao === 'ping') {
    sendResponse({ sucesso: true, pong: true });
    return false; // Resposta síncrona
  }
  
  if (request.acao === 'processarAgora') {
    // Processa em background - não depende do popup estar aberto
    (async () => {
      try {
        await processarEmails();
        try {
          sendResponse({ sucesso: true });
        } catch (sendError) {
          // Popup pode ter fechado, mas processamento continua
          console.log('[EmailZen] Processamento concluído (popup pode ter fechado)');
        }
      } catch (error) {
        console.error('[EmailZen] Erro no processamento:', error);
        try {
          sendResponse({ sucesso: false, erro: error.message });
        } catch (sendError) {
          // Popup pode ter fechado, mas erro foi logado
          console.error('[EmailZen] Erro no processamento (popup pode ter fechado):', error);
        }
      }
    })();
    return true; // Indica resposta assíncrona
  }
  
  if (request.acao === 'verificarExclusoesAgora') {
    verificarExclusoes().then(() => {
      sendResponse({ sucesso: true });
    }).catch(error => {
      sendResponse({ sucesso: false, erro: error.message });
    });
    return true;
  }
  
  if (request.acao === 'buscarContador') {
    buscarContadorEmails(request.label).then(contador => {
      sendResponse({ contador });
    }).catch(error => {
      sendResponse({ contador: 0, erro: error.message });
    });
    return true;
  }
  
  if (request.acao === 'obterRegras') {
    obterRegras().then(regras => {
      sendResponse({ regras });
    }).catch(error => {
      sendResponse({ regras: [], erro: error.message });
    });
    return true;
  }
  
  if (request.acao === 'analisarSugestoes') {
    // Analisa em background - não depende do popup estar aberto
    (async () => {
      try {
        const sugestoes = await analisarSugestoes();
        try {
          sendResponse({ sucesso: true, sugestoes });
        } catch (sendError) {
          // Popup pode ter fechado, mas análise continua e salva resultados
          console.log('[EmailZen] Análise concluída (popup pode ter fechado)');
          // Salva sugestões mesmo se popup fechou
          const { salvarSugestoes } = await import('../utils/storage.js');
          await salvarSugestoes(sugestoes);
        }
      } catch (error) {
        console.error('[EmailZen] Erro na análise:', error);
        try {
          sendResponse({ sucesso: false, erro: error.message, sugestoes: [] });
        } catch (sendError) {
          // Popup pode ter fechado, mas erro foi logado
          console.error('[EmailZen] Erro na análise (popup pode ter fechado):', error);
        }
      }
    })();
    return true;
  }
  
  if (request.acao === 'criarRegraAutomatica') {
    // Cria regra em background - não depende do popup estar aberto
    (async () => {
      try {
        const regraId = await criarRegraAutomatica(request.sugestao, request.opcoes);
        try {
          sendResponse({ sucesso: true, regraId });
        } catch (sendError) {
          // Popup pode ter fechado, mas regra foi criada
          console.log(`[EmailZen] Regra criada: ${regraId} (popup pode ter fechado)`);
        }
      } catch (error) {
        console.error('[EmailZen] Erro ao criar regra:', error);
        try {
          sendResponse({ sucesso: false, erro: error.message });
        } catch (sendError) {
          // Popup pode ter fechado, mas erro foi logado
          console.error('[EmailZen] Erro ao criar regra (popup pode ter fechado):', error);
        }
      }
    })();
    return true;
  }
  
  if (request.acao === 'executarRegra') {
    // Garante que sempre envia uma resposta
    console.log(`[EmailZen] Recebida requisição para executar regra: ${request.regraId}`);
    
    // Executa de forma assíncrona mas garante resposta
    (async () => {
      try {
        const resultado = await executarRegraIndividual(request.regraId);
        try {
          sendResponse({ 
            sucesso: true, 
            processados: resultado.processados,
            total: resultado.total
          });
          console.log(`[EmailZen] Resposta enviada com sucesso para regra ${request.regraId}: ${resultado.processados} processados`);
        } catch (sendError) {
          console.error('[EmailZen] Erro ao enviar resposta:', sendError);
        }
      } catch (error) {
        console.error('[EmailZen] Erro ao executar regra:', error);
        try {
          sendResponse({ 
            sucesso: false, 
            erro: error.message || 'Erro desconhecido' 
          });
        } catch (sendError) {
          console.error('[EmailZen] Erro ao enviar resposta de erro:', sendError);
        }
      }
    })();
    
    return true; // Indica resposta assíncrona
  }
  
  if (request.acao === 'atualizarAlarmeVerificacao') {
    atualizarAlarmeVerificacao(request.ativa, request.intervaloMinutos).then(() => {
      sendResponse({ sucesso: true });
    }).catch(error => {
      console.error('[EmailZen] Erro ao atualizar alarme:', error);
      sendResponse({ sucesso: false, erro: error.message });
    });
    return true;
  }
});

/**
 * Inicialização quando extensão é instalada
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[EmailZen] Extensão instalada');
  
  // Inicializa alarme de verificação automática baseado na configuração
  await inicializarAlarmeVerificacao();
  
  // Verifica exclusões uma vez por dia
  chrome.alarms.create('verificarExclusoes', {
    periodInMinutes: 24 * 60 // 24 horas
  });
  
  // Processa imediatamente após instalação
  setTimeout(() => {
    processarEmails();
  }, 5000); // Aguarda 5 segundos para garantir que tudo está pronto
});

/**
 * Processa emails quando extensão é iniciada
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[EmailZen] Extensão iniciada');
  await inicializarAlarmeVerificacao();
  processarEmails();
});

