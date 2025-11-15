/**
 * Service Worker - Processamento em background
 * Processa emails automaticamente e gerencia exclusões
 */

import { obterRegras, salvarEstatisticas, adicionarHistorico } from '../utils/storage.js';
import { 
  buscarMensagens, 
  obterMensagem, 
  modificarMensagem, 
  excluirMensagem,
  obterLabels,
  criarLabel,
  mensagemCorrespondeRegra,
  processarMensagensBatch
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
 * Processa emails da inbox
 */
async function processarEmails() {
  try {
    console.log('[Gmail Organizer] Iniciando processamento de emails...');
    
    const regras = await obterRegras();
    const regrasAtivas = regras.filter(r => r.ativa);
    
    if (regrasAtivas.length === 0) {
      console.log('[Gmail Organizer] Nenhuma regra ativa encontrada');
      return;
    }
    
    await inicializarLabelsCache();
    
    // Busca mensagens não lidas na inbox
    const resultado = await buscarMensagens({
      query: 'in:inbox is:unread',
      maxResults: 50
    });
    
    if (!resultado.messages || resultado.messages.length === 0) {
      console.log('[Gmail Organizer] Nenhuma mensagem nova para processar');
      return;
    }
    
    const messageIds = resultado.messages.map(m => m.id);
    console.log(`[Gmail Organizer] Processando ${messageIds.length} mensagens...`);
    
    // Processa em batches
    const resultados = await processarMensagensBatch(
      messageIds,
      (msgId) => processarMensagem(msgId, regrasAtivas),
      10
    );
    
    const processados = resultados.filter(r => r.processado).length;
    console.log(`[Gmail Organizer] ${processados} mensagens processadas`);
    
    // Atualiza estatísticas
    const { emailsProcessados = 0 } = await chrome.storage.local.get(['estatisticas']);
    await salvarEstatisticas({
      emailsProcessados: emailsProcessados + processados
    });
    
  } catch (error) {
    console.error('[Gmail Organizer] Erro no processamento:', error);
  }
}

/**
 * Verifica e exclui emails antigos baseado em regras de retenção
 */
async function verificarExclusoes() {
  try {
    console.log('[Gmail Organizer] Verificando emails para exclusão...');
    
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
      console.log(`[Gmail Organizer] ${emailsExcluidos} emails excluídos`);
      
      const { emailsExcluidos: total = 0 } = await chrome.storage.local.get(['estatisticas']);
      await salvarEstatisticas({
        emailsExcluidos: total + emailsExcluidos
      });
    }
    
  } catch (error) {
    console.error('[Gmail Organizer] Erro na verificação de exclusões:', error);
  }
}

/**
 * Listener para alarmes do Chrome
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'processarEmails') {
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
 * Listener para mensagens do content script ou popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.acao === 'processarAgora') {
    processarEmails().then(() => {
      sendResponse({ sucesso: true });
    }).catch(error => {
      sendResponse({ sucesso: false, erro: error.message });
    });
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
});

/**
 * Inicialização quando extensão é instalada
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Gmail Organizer] Extensão instalada');
  
  // Cria alarmes periódicos
  // Processa emails a cada 30 minutos
  chrome.alarms.create('processarEmails', {
    periodInMinutes: 30
  });
  
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
chrome.runtime.onStartup.addListener(() => {
  console.log('[Gmail Organizer] Extensão iniciada');
  processarEmails();
});

