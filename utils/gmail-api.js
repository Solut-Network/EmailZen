/**
 * Utilitário para interação com Gmail API
 */

import { salvarToken, obterToken, removerToken } from './storage.js';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

/**
 * Obtém token de acesso via OAuth 2.0
 * @returns {Promise<string>} Token de acesso
 */
export async function obterTokenOAuth() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(
      { 
        interactive: true,
        scopes: [
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/gmail.labels',
          'https://www.googleapis.com/auth/gmail.readonly'
        ]
      },
      async (token) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          console.error('[EmailZen] Erro ao obter token:', errorMsg);
          reject(new Error(errorMsg));
          return;
        }
        
        if (!token) {
          reject(new Error('Token não foi retornado. Verifique se autorizou os escopos necessários.'));
          return;
        }
        
        await salvarToken(token);
        console.log('[EmailZen] Token OAuth obtido com sucesso');
        resolve(token);
      }
    );
  });
}

/**
 * Faz logout removendo token
 */
export async function fazerLogout() {
  const token = await obterToken();
  if (token) {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      removerToken();
    });
  }
}

/**
 * Faz requisição autenticada para Gmail API
 * @param {string} endpoint - Endpoint da API (sem base URL)
 * @param {Object} options - Opções da requisição (method, body, etc)
 * @returns {Promise<Object>} Resposta da API
 */
async function fazerRequisicao(endpoint, options = {}) {
  let token = await obterToken();
  
  // Se não tem token, tenta obter
  if (!token) {
    token = await obterTokenOAuth();
  }
  
  const url = `${GMAIL_API_BASE}${endpoint}`;
  const config = {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  
  if (options.body) {
    config.body = JSON.stringify(options.body);
  }
  
  const response = await fetch(url, config);
  
  // Se token expirou (401), tenta renovar
  if (response.status === 401) {
    console.log('[EmailZen] Token expirado, renovando...');
    await removerToken();
    token = await obterTokenOAuth();
    config.headers['Authorization'] = `Bearer ${token}`;
    const retryResponse = await fetch(url, config);
    
    if (!retryResponse.ok) {
      throw new Error(`Erro na API: ${retryResponse.status} ${retryResponse.statusText}`);
    }
    
    return await retryResponse.json();
  }
  
  // Se acesso negado (403), pode ser problema de permissões ou escopos
  if (response.status === 403) {
    const errorBody = await response.text().catch(() => '');
    console.error('[EmailZen] Erro 403 - Acesso negado:', errorBody);
    
    // Tenta reautenticar para obter novos escopos
    console.log('[EmailZen] Tentando reautenticar com escopos corretos...');
    await removerToken();
    token = await obterTokenOAuth();
    config.headers['Authorization'] = `Bearer ${token}`;
    const retryResponse = await fetch(url, config);
    
    if (!retryResponse.ok) {
      if (retryResponse.status === 403) {
        throw new Error(`Erro 403: Acesso negado à Gmail API. Verifique se:\n1. A Gmail API está ativada no Google Cloud Console\n2. Os escopos estão configurados na tela de consentimento OAuth\n3. Você autorizou todos os escopos necessários`);
      }
      throw new Error(`Erro na API: ${retryResponse.status} ${retryResponse.statusText}`);
    }
    
    return await retryResponse.json();
  }
  
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error('[EmailZen] Erro na API:', response.status, errorBody);
    throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Obtém lista de labels do Gmail
 * @returns {Promise<Array>} Lista de labels
 */
export async function obterLabels() {
  try {
    const response = await fazerRequisicao('/users/me/labels');
    return response.labels || [];
  } catch (error) {
    console.error('Erro ao obter labels:', error);
    throw error;
  }
}

/**
 * Cria um novo label
 * @param {string} nome - Nome do label
 * @returns {Promise<Object>} Label criado
 */
export async function criarLabel(nome) {
  try {
    const response = await fazerRequisicao('/users/me/labels', {
      method: 'POST',
      body: {
        name: nome,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show'
      }
    });
    return response;
  } catch (error) {
    console.error('Erro ao criar label:', error);
    throw error;
  }
}

/**
 * Obtém lista de mensagens com filtros
 * @param {Object} filtros - Filtros de busca (query, maxResults, etc)
 * @returns {Promise<Array>} Lista de IDs de mensagens
 */
export async function buscarMensagens(filtros = {}) {
  try {
    const query = filtros.query || '';
    const maxResults = filtros.maxResults || 100;
    const pageToken = filtros.pageToken || '';
    
    let endpoint = `/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    if (pageToken) {
      endpoint += `&pageToken=${encodeURIComponent(pageToken)}`;
    }
    
    const response = await fazerRequisicao(endpoint);
    return {
      messages: response.messages || [],
      nextPageToken: response.nextPageToken || null,
      resultSizeEstimate: response.resultSizeEstimate || 0
    };
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    throw error;
  }
}

/**
 * Obtém detalhes de uma mensagem
 * @param {string} messageId - ID da mensagem
 * @returns {Promise<Object>} Detalhes da mensagem
 */
export async function obterMensagem(messageId) {
  try {
    const response = await fazerRequisicao(`/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
    return response;
  } catch (error) {
    console.error('Erro ao obter mensagem:', error);
    throw error;
  }
}

/**
 * Aplica modificações em uma mensagem (label, marcar lido, arquivar)
 * @param {string} messageId - ID da mensagem
 * @param {Object} modificacoes - { addLabelIds, removeLabelIds }
 * @returns {Promise<Object>} Resposta da API
 */
export async function modificarMensagem(messageId, modificacoes) {
  try {
    const response = await fazerRequisicao(`/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      body: modificacoes
    });
    return response;
  } catch (error) {
    console.error('Erro ao modificar mensagem:', error);
    throw error;
  }
}

/**
 * Move mensagem para lixeira
 * @param {string} messageId - ID da mensagem
 * @returns {Promise<Object>} Resposta da API
 */
export async function excluirMensagem(messageId) {
  try {
    const response = await fazerRequisicao(`/users/me/messages/${messageId}/trash`, {
      method: 'POST'
    });
    return response;
  } catch (error) {
    console.error('Erro ao excluir mensagem:', error);
    throw error;
  }
}

/**
 * Processa mensagens em batch
 * @param {Array} messageIds - Lista de IDs de mensagens
 * @param {Function} processador - Função que processa cada mensagem
 * @param {number} batchSize - Tamanho do batch (padrão: 10)
 * @returns {Promise<Array>} Resultados do processamento
 */
export async function processarMensagensBatch(messageIds, processador, batchSize = 10) {
  const resultados = [];
  
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const promises = batch.map(msgId => processador(msgId).catch(err => ({ erro: err.message, messageId: msgId })));
    const batchResultados = await Promise.all(promises);
    resultados.push(...batchResultados);
    
    // Rate limiting: aguarda 100ms entre batches
    if (i + batchSize < messageIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return resultados;
}

/**
 * Verifica se uma mensagem corresponde a uma regra
 * @param {Object} mensagem - Objeto da mensagem (com headers)
 * @param {Object} regra - Regra de filtro
 * @returns {boolean} true se corresponde
 */
export function mensagemCorrespondeRegra(mensagem, regra) {
  if (!regra.ativa) return false;
  
  const headers = {};
  mensagem.payload?.headers?.forEach(header => {
    headers[header.name.toLowerCase()] = header.value;
  });
  
  const from = headers.from || '';
  const subject = headers.subject || '';
  
  // Verifica remetente
  if (regra.condicoes?.remetente?.length > 0) {
    const correspondeRemetente = regra.condicoes.remetente.some(rem => {
      if (rem.startsWith('@')) {
        return from.toLowerCase().includes(rem.toLowerCase());
      }
      return from.toLowerCase().includes(rem.toLowerCase());
    });
    
    if (!correspondeRemetente) return false;
  }
  
  // Verifica assunto
  if (regra.condicoes?.assunto?.length > 0) {
    const correspondeAssunto = regra.condicoes.assunto.some(palavra => {
      return subject.toLowerCase().includes(palavra.toLowerCase());
    });
    
    if (!correspondeAssunto) return false;
  }
  
  // Verifica conteúdo (precisa buscar mensagem completa)
  // Esta verificação será feita quando necessário
  
  return true;
}

/**
 * Extrai domínio de um email ou campo From
 * @param {string} from - Campo From do header ou email completo
 * @returns {string} Domínio (ex: "exemplo.com")
 */
function extrairDominio(from) {
  // Tenta extrair email primeiro
  const emailMatch = from.match(/<([^>]+)>/) || from.match(/([\w\.-]+@[\w\.-]+\.\w+)/);
  const email = emailMatch ? emailMatch[1] : from;
  
  // Extrai domínio do email
  const dominioMatch = email.match(/@([^\s>]+)/);
  if (dominioMatch) {
    let dominio = dominioMatch[1].toLowerCase();
    // Remove caracteres inválidos no final
    dominio = dominio.replace(/[^\w\.-]+$/, '');
    return dominio;
  }
  return '';
}

/**
 * Extrai nome do remetente de um email
 * @param {string} from - Campo From do header
 * @returns {string} Email do remetente
 */
function extrairEmailRemetente(from) {
  const match = from.match(/<([^>]+)>/) || from.match(/([\w\.-]+@[\w\.-]+\.\w+)/);
  return match ? match[1].toLowerCase() : from.toLowerCase();
}

/**
 * Analisa remetentes frequentes na inbox
 * @param {number} limiteMinimo - Número mínimo de emails para considerar (padrão: 2)
 * @param {number} maxResultados - Máximo de resultados (padrão: 10)
 * @returns {Promise<Array>} Lista de remetentes frequentes com estatísticas
 */
export async function analisarRemetentesFrequentes(limiteMinimo = 2, maxResultados = 10) {
  try {
    console.log('[EmailZen] Iniciando análise de remetentes frequentes...');
    
    // Busca emails da inbox (últimos 1000 para análise mais completa)
    // Tenta buscar mais emails para ter uma amostra melhor
    let resultado = await buscarMensagens({
      query: 'in:inbox',
      maxResults: 500
    });
    
    // Se há mais páginas, busca mais emails
    let totalEmails = resultado.messages ? resultado.messages.length : 0;
    while (resultado.nextPageToken && totalEmails < 1000) {
      const proximaPagina = await buscarMensagens({
        query: 'in:inbox',
        maxResults: 500,
        pageToken: resultado.nextPageToken
      });
      if (proximaPagina.messages && proximaPagina.messages.length > 0) {
        resultado.messages = [...(resultado.messages || []), ...proximaPagina.messages];
        resultado.nextPageToken = proximaPagina.nextPageToken;
        totalEmails = resultado.messages.length;
      } else {
        break;
      }
    }
    
    if (!resultado.messages || resultado.messages.length === 0) {
      console.log('[EmailZen] Nenhum email encontrado para análise');
      return [];
    }
    
    console.log(`[EmailZen] Analisando ${resultado.messages.length} emails...`);
    
    // Contador de remetentes
    const remetentesMap = new Map();
    
    // Processa em batches para não sobrecarregar
    const batchSize = 50;
    for (let i = 0; i < resultado.messages.length; i += batchSize) {
      const batch = resultado.messages.slice(i, i + batchSize);
      const promises = batch.map(async (msg) => {
        try {
          const mensagem = await obterMensagem(msg.id);
          const headers = {};
          mensagem.payload?.headers?.forEach(header => {
            headers[header.name.toLowerCase()] = header.value;
          });
          
          const from = headers.from || '';
          if (from) {
            const email = extrairEmailRemetente(from);
            const dominio = extrairDominio(from);
            
            // Conta por domínio (mais útil para identificar serviços)
            if (dominio && dominio.length > 0) {
              const atual = remetentesMap.get(dominio) || {
                dominio,
                email: email,
                count: 0,
                ultimoEmail: null
              };
              atual.count++;
              if (!atual.ultimoEmail || msg.id > atual.ultimoEmail) {
                atual.ultimoEmail = msg.id;
              }
              remetentesMap.set(dominio, atual);
            } else {
              console.warn(`[EmailZen] Não foi possível extrair domínio de: ${from}`);
            }
          }
        } catch (error) {
          console.error(`Erro ao processar mensagem ${msg.id}:`, error);
        }
      });
      
      await Promise.all(promises);
      
      // Rate limiting
      if (i + batchSize < resultado.messages.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Converte para array e filtra por limite mínimo
    const remetentesFrequentes = Array.from(remetentesMap.values())
      .filter(r => r.count >= limiteMinimo)
      .sort((a, b) => b.count - a.count)
      .slice(0, maxResultados)
      .map(r => ({
        dominio: r.dominio,
        email: r.email,
        quantidade: r.count,
        porcentagem: ((r.count / resultado.messages.length) * 100).toFixed(1)
      }));
    
    console.log(`[EmailZen] Encontrados ${remetentesFrequentes.length} remetentes frequentes:`, remetentesFrequentes);
    
    // Log detalhado para debug
    if (remetentesFrequentes.length === 0 && resultado.messages.length > 0) {
      console.log('[EmailZen] Debug: Nenhum remetente frequente encontrado, mas há emails. Verificando...');
      // Mostra alguns domínios encontrados para debug
      const todosDominios = Array.from(remetentesMap.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);
      console.log('[EmailZen] Top 5 domínios encontrados:', todosDominios);
    }
    
    return remetentesFrequentes;
  } catch (error) {
    console.error('[EmailZen] Erro ao analisar remetentes:', error);
    throw error;
  }
}

