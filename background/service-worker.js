/**
 * Service Worker - Processamento em background
 * Processa emails automaticamente e gerencia exclusões
 */

import { obterRegras, salvarEstatisticas, adicionarHistorico, salvarRegra, obterConfigVerificacao, salvarSugestoes, salvarRemetenteProcessado, obterRemetenteProcessado } from '../utils/storage.js';
import { 
  buscarMensagens, 
  obterMensagem, 
  modificarMensagem, 
  excluirMensagem,
  obterLabels,
  criarLabel,
  mensagemCorrespondeRegra,
  processarMensagensBatch,
  analisarRemetentesFrequentes,
  extrairDominio,
  extrairEmailRemetente
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
  try {
    // Usa import estático (já importado no topo do arquivo)
    const config = await obterConfigVerificacao();
    
    console.log(`[EmailZen] Inicializando alarme de verificação: ${config.ativa ? 'Ativo' : 'Inativo'}, intervalo: ${config.intervaloMinutos} minutos`);
    
    await atualizarAlarmeVerificacao(config.ativa, config.intervaloMinutos);
    
    // Verifica se o alarme foi criado corretamente
    if (config.ativa) {
      const alarme = await chrome.alarms.get('processarEmails');
      if (alarme) {
        console.log(`[EmailZen] Alarme configurado com sucesso. Próxima execução em ${Math.ceil((alarme.scheduledTime - Date.now()) / 1000 / 60)} minutos`);
      } else {
        console.warn('[EmailZen] Alarme não foi criado, mas deveria estar ativo');
      }
    }
  } catch (error) {
    console.error('[EmailZen] Erro ao inicializar alarme de verificação:', error);
    // Em caso de erro, cria alarme padrão (5 minutos)
    try {
      await atualizarAlarmeVerificacao(true, 5);
      console.log('[EmailZen] Alarme padrão criado (5 minutos) devido a erro na configuração');
    } catch (fallbackError) {
      console.error('[EmailZen] Erro ao criar alarme padrão:', fallbackError);
    }
  }
}

/**
 * Listener para alarmes do Chrome
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === 'processarEmails') {
      console.log('[EmailZen] Alarme disparado: processando emails automaticamente...');
      await processarEmails();
      console.log('[EmailZen] Processamento automático concluído');
    } else if (alarm.name === 'verificarExclusoes') {
      console.log('[EmailZen] Alarme disparado: verificando exclusões...');
      await verificarExclusoes();
      console.log('[EmailZen] Verificação de exclusões concluída');
    } else {
      console.log(`[EmailZen] Alarme desconhecido disparado: ${alarm.name}`);
    }
  } catch (error) {
    console.error(`[EmailZen] Erro ao processar alarme ${alarm.name}:`, error);
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
/**
 * Analisa sugestões com callback de progresso
 */
async function analisarSugestoesComProgresso(callbackProgresso = null) {
  try {
    console.log('[EmailZen] Iniciando análise inteligente...');
    
    // Verifica regras existentes para não sugerir duplicatas
    const regrasExistentes = await obterRegras();
    const dominiosJaRegrados = new Set();
    
    regrasExistentes.forEach(regra => {
      if (regra.condicoes?.remetente) {
        regra.condicoes.remetente.forEach(rem => {
          // Extrai domínio da regra (pode ser @dominio ou email@dominio)
          let dominio = '';
          if (rem.startsWith('@')) {
            dominio = rem.substring(1).toLowerCase().trim();
          } else if (rem.includes('@')) {
            // Se é um email completo, extrai o domínio
            const partes = rem.split('@');
            if (partes.length > 1) {
              dominio = partes[1].toLowerCase().trim();
            }
          } else {
            dominio = rem.toLowerCase().trim();
          }
          
          if (dominio) {
            // Adiciona tanto o domínio completo quanto o raiz
            dominiosJaRegrados.add(dominio);
            
            // Usa a função extrairDominio para obter o domínio raiz
            // Como não temos acesso direto à função extrairDominioRaiz,
            // vamos extrair manualmente (últimas 2 partes)
            const partes = dominio.split('.');
            if (partes.length >= 2) {
              // Para TLDs compostos, pode ter 3 partes
              const tldsCompostos = ['co.uk', 'com.br', 'com.au', 'com.mx', 'com.ar', 'com.co'];
              let dominioRaiz = '';
              
              if (partes.length >= 3) {
                const ultimasDuas = partes.slice(-2).join('.');
                if (tldsCompostos.includes(ultimasDuas)) {
                  // TLD composto, pega últimas 3 partes
                  dominioRaiz = partes.slice(-3).join('.');
                } else {
                  // TLD simples, pega últimas 2 partes
                  dominioRaiz = partes.slice(-2).join('.');
                }
              } else {
                dominioRaiz = dominio;
              }
              
              if (dominioRaiz && dominioRaiz !== dominio) {
                dominiosJaRegrados.add(dominioRaiz);
              }
            }
          }
        });
      }
    });
    
    console.log(`[EmailZen] ${dominiosJaRegrados.size} domínio(s) já possuem regras:`, Array.from(dominiosJaRegrados).slice(0, 10));
    
    // Analisa remetentes frequentes (limite mínimo: 2 emails, máximo: 20 resultados)
    // Aumentado maxResultados para 20 para mostrar mais sugestões
    console.log('[EmailZen] Chamando analisarRemetentesFrequentes...');
    const remetentesFrequentes = await analisarRemetentesFrequentes(2, 20, callbackProgresso);
    console.log(`[EmailZen] analisarRemetentesFrequentes retornou ${remetentesFrequentes?.length || 0} remetentes`);
    
    // Filtra remetentes que já têm regras (verifica domínio raiz)
    const sugestoes = remetentesFrequentes
      .filter(r => {
        // Verifica se o domínio raiz ou completo já está nas regras
        const dominioRaiz = r.dominio;
        const dominioCompleto = r.dominioCompleto;
        
        // Verifica domínio raiz
        if (dominiosJaRegrados.has(dominioRaiz)) {
          return false;
        }
        
        // Verifica domínio completo (se diferente do raiz)
        if (dominioCompleto && dominioCompleto !== dominioRaiz && dominiosJaRegrados.has(dominioCompleto)) {
          return false;
        }
        
        // Verifica se algum subdomínio já está nas regras
        if (r.subdominios && r.subdominios.length > 0) {
          for (const subdominio of r.subdominios) {
            if (dominiosJaRegrados.has(subdominio)) {
              return false;
            }
          }
        }
        
        return true;
      })
      .map(r => ({
        dominio: r.dominio, // Domínio raiz (agrupado)
        dominioCompleto: r.dominioCompleto, // Primeiro domínio completo encontrado
        quantidade: r.quantidade,
        porcentagem: r.porcentagem,
        temSubdominios: r.temSubdominios || false,
        subdominios: r.subdominios || [],
        exemploSubdominios: r.exemploSubdominios || '',
        sugestaoLabel: r.dominio.split('.')[0] || r.dominio
      }));
    
    console.log(`[EmailZen] ${sugestoes.length} sugestões geradas (de ${remetentesFrequentes.length} remetentes frequentes)`);
    
    // Debug detalhado
    if (remetentesFrequentes.length === 0) {
      console.warn('[EmailZen] Nenhum remetente frequente encontrado após análise!');
      console.log('[EmailZen] Debug - Verificando possíveis causas:');
      console.log(`  - Total de não lidas analisadas: ${emailsProcessados || 'N/A'}`);
      console.log(`  - Domínios únicos encontrados: ${remetentesMap?.size || 'N/A'}`);
      console.log(`  - Domínios com regras: ${dominiosJaRegrados?.size || 'N/A'}`);
    } else if (sugestoes.length === 0) {
      console.warn('[EmailZen] Remetentes frequentes encontrados, mas todos foram filtrados (já têm regras)');
      console.log('[EmailZen] Primeiros remetentes frequentes (antes do filtro):', remetentesFrequentes.slice(0, 5).map(r => ({
        dominio: r.dominio,
        quantidade: r.quantidade,
        temRegra: r.temRegra
      })));
    } else {
      console.log('[EmailZen] Sugestões geradas com sucesso:', sugestoes.map(s => ({
        dominio: s.dominio,
        quantidade: s.quantidade
      })));
    }
    
    return sugestoes;
  } catch (error) {
    console.error('[EmailZen] Erro ao analisar sugestões:', error);
    throw error;
  }
}

/**
 * Analisa sugestões (versão sem progresso para compatibilidade)
 */
async function analisarSugestoes() {
  return await analisarSugestoesComProgresso(null);
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
    console.log('[EmailZen] Recebida solicitação de análise de sugestões');
    
    // Responde imediatamente para evitar timeout
    // A análise continua em background e envia progresso via mensagens
    try {
      sendResponse({ sucesso: true, emAndamento: true });
      console.log('[EmailZen] Resposta enviada: análise em andamento');
    } catch (error) {
      console.error('[EmailZen] Erro ao enviar resposta inicial:', error);
    }
    
    // Retorna false porque a resposta já foi enviada síncronamente
    // Mas o processamento continua em background
    (async () => {
      console.log('[EmailZen] Iniciando análise em background...');
      let analiseAbortada = false;
      
      // Listener para verificar se análise foi abortada
      const abortListener = (msg, sender, sendResponse) => {
        if (msg.acao === 'abortarAnalise') {
          analiseAbortada = true;
          sendResponse({ sucesso: true });
          return true;
        }
      };
      chrome.runtime.onMessage.addListener(abortListener);
      
      // Variável para garantir que o progresso só aumente
      let ultimoProgressoEnviado = 0;
      
      // Callback de progresso
      const callbackProgresso = (processados, total, etapa) => {
        console.log(`[EmailZen] Callback progresso chamado: ${processados}/${total} - ${etapa}`);
        
        if (analiseAbortada) {
          console.log('[EmailZen] Análise foi abortada, retornando true para parar');
          return true; // Indica abortar
        }
        
        // Garante que o progresso só aumente (evita regressão visual)
        const progressoAtual = Math.max(processados, ultimoProgressoEnviado);
        ultimoProgressoEnviado = progressoAtual;
        
        // Envia progresso para options page se estiver aberta
        try {
          console.log(`[EmailZen] Enviando mensagem de progresso: ${progressoAtual}/${total}`);
          chrome.runtime.sendMessage({
            acao: 'analiseProgresso',
            processados: progressoAtual,
            total,
            etapa
          }).catch((err) => {
            // Options page pode não estar aberta, ignora erro
            console.log('[EmailZen] Erro ao enviar progresso (options page pode estar fechada):', err);
          });
        } catch (e) {
          // Ignora erros de envio
          console.error('[EmailZen] Erro ao enviar mensagem de progresso:', e);
        }
        
        return analiseAbortada;
      };
      
      // Retry automático com até 3 tentativas
      const maxTentativas = 3;
      let tentativaAtual = 0;
      let sugestoes = null;
      let ultimoErro = null;
      
      while (tentativaAtual < maxTentativas) {
        tentativaAtual++;
        
        try {
          // Envia progresso sobre tentativa
          if (tentativaAtual > 1) {
            try {
              chrome.runtime.sendMessage({
                acao: 'analiseProgresso',
                processados: 0,
                total: 0,
                etapa: `Tentativa ${tentativaAtual}/${maxTentativas}...`
              }).catch(() => {});
            } catch (e) {}
            
            // Aguarda um pouco antes de tentar novamente (backoff exponencial)
            const delay = Math.min(1000 * Math.pow(2, tentativaAtual - 2), 5000);
            console.log(`[EmailZen] Aguardando ${delay}ms antes da tentativa ${tentativaAtual}...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          // Verifica se foi abortada antes de tentar novamente
          if (analiseAbortada) {
            throw new Error('Análise abortada pelo usuário');
          }
          
          console.log(`[EmailZen] Iniciando tentativa ${tentativaAtual}/${maxTentativas} da análise...`);
          
          // Modifica analisarSugestoes para aceitar callback
          sugestoes = await analisarSugestoesComProgresso(callbackProgresso);
          
          // Se chegou aqui, análise foi bem-sucedida
          console.log(`[EmailZen] Análise concluída com sucesso na tentativa ${tentativaAtual}`);
          break;
          
        } catch (error) {
          ultimoErro = error;
          
          // Se foi abortada, não tenta novamente
          if (error.message && error.message.includes('abortada')) {
            console.log('[EmailZen] Análise abortada pelo usuário');
            chrome.runtime.onMessage.removeListener(abortListener);
            
            try {
              chrome.runtime.sendMessage({
                acao: 'analiseConcluida',
                sucesso: false,
                abortada: true,
                sugestoes: []
              }).catch(() => {
                console.log('[EmailZen] Análise abortada (options page pode ter fechado)');
              });
            } catch (sendError) {
              console.log('[EmailZen] Análise abortada');
            }
            return;
          }
          
          // Verifica se é um erro que deve ser retentado
          const deveRetentar = error.message && (
            error.message.includes('Timeout') ||
            error.message.includes('timeout') ||
            error.message.includes('429') ||
            error.message.includes('rate limit') ||
            error.message.includes('network') ||
            error.message.includes('ECONNRESET') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('Failed to fetch')
          );
          
          console.error(`[EmailZen] Erro na tentativa ${tentativaAtual}/${maxTentativas}:`, error.message);
          
          if (!deveRetentar) {
            // Erro não é transitório, não tenta novamente
            console.error('[EmailZen] Erro permanente, não será retentado:', error.message);
            break;
          }
          
          // Se é a última tentativa, não tenta novamente
          if (tentativaAtual >= maxTentativas) {
            console.error(`[EmailZen] Esgotadas ${maxTentativas} tentativas, falhando análise`);
            break;
          }
          
          console.log(`[EmailZen] Erro transitório detectado, tentando novamente... (${tentativaAtual}/${maxTentativas})`);
        }
      }
      
      chrome.runtime.onMessage.removeListener(abortListener);
      
      // Se conseguiu sugestões, envia resultado final
      if (sugestoes) {
        try {
          chrome.runtime.sendMessage({
            acao: 'analiseConcluida',
            sucesso: true,
            sugestoes,
            tentativas: tentativaAtual
          }).catch(() => {
            // Options page pode não estar aberta, salva resultados
            console.log('[EmailZen] Análise concluída (options page pode ter fechado)');
            salvarSugestoes(sugestoes);
          });
        } catch (sendError) {
          // Salva sugestões mesmo se não conseguir enviar mensagem
          console.log('[EmailZen] Análise concluída, salvando resultados...');
          await salvarSugestoes(sugestoes);
        }
      } else {
        // Falhou após todas as tentativas
        const mensagemErro = ultimoErro 
          ? `Erro após ${tentativaAtual} tentativa(s): ${ultimoErro.message}`
          : `Erro desconhecido após ${tentativaAtual} tentativa(s)`;
        
        console.error('[EmailZen] Análise falhou:', mensagemErro);
        
        try {
          chrome.runtime.sendMessage({
            acao: 'analiseConcluida',
            sucesso: false,
            erro: mensagemErro,
            tentativas: tentativaAtual,
            sugestoes: []
          }).catch(() => {
            console.error('[EmailZen] Erro na análise (options page pode ter fechado):', mensagemErro);
          });
        } catch (sendError) {
          // Erro foi logado
          console.error('[EmailZen] Erro na análise:', mensagemErro);
        }
      }
    })();
    return false; // Resposta já foi enviada
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

