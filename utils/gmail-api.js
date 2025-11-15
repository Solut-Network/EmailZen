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
  
  // Se rate limit excedido (429), tenta novamente com backoff exponencial
  if (response.status === 429) {
    const errorBody = await response.text().catch(() => '');
    let errorData = {};
    try {
      errorData = JSON.parse(errorBody);
    } catch (e) {
      // Ignora erro de parsing
    }
    
    const maxRetries = 5;
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount < maxRetries) {
      // Backoff exponencial: 2^retryCount segundos (mínimo 2s, máximo 32s)
      const delaySeconds = Math.min(Math.pow(2, retryCount), 32);
      console.log(`[EmailZen] Rate limit excedido (429). Aguardando ${delaySeconds}s antes de tentar novamente (tentativa ${retryCount + 1}/${maxRetries})...`);
      
      await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
      
      try {
        const retryResponse = await fetch(url, config);
        
        if (retryResponse.ok) {
          console.log(`[EmailZen] Requisição bem-sucedida após ${retryCount + 1} tentativa(s)`);
          return await retryResponse.json();
        }
        
        if (retryResponse.status !== 429) {
          // Se não é mais 429, propaga o erro
          const retryErrorBody = await retryResponse.text().catch(() => '');
          throw new Error(`Erro na API: ${retryResponse.status} ${retryResponse.statusText}`);
        }
        
        // Ainda é 429, continua o loop
        retryCount++;
        lastError = new Error(`Erro 429: Rate limit excedido após ${maxRetries} tentativas`);
      } catch (error) {
        retryCount++;
        lastError = error;
        if (retryCount >= maxRetries) {
          break;
        }
      }
    }
    
    throw lastError || new Error('Erro 429: Rate limit excedido. Tente novamente mais tarde.');
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
    const emailRemetente = extrairEmailRemetente(from);
    const dominioCompleto = extrairDominio(from, false);
    const dominioRaiz = extrairDominio(from, true);
    
    const correspondeRemetente = regra.condicoes.remetente.some(rem => {
      const remLower = rem.toLowerCase();
      
      // Se começa com @, é um domínio
      if (remLower.startsWith('@')) {
        const dominioRegra = remLower.substring(1);
        
        // Verifica se corresponde ao domínio completo
        if (dominioCompleto === dominioRegra) return true;
        
        // Verifica se corresponde ao domínio raiz (para pegar subdomínios)
        if (dominioRaiz === dominioRegra) return true;
        
        // Verifica se o domínio da regra é um subdomínio do domínio raiz
        if (dominioCompleto.endsWith('.' + dominioRegra) || dominioRaiz.endsWith('.' + dominioRegra)) {
          return true;
        }
        
        // Verifica se o domínio da regra contém o domínio raiz (caso inverso)
        if (dominioRegra.endsWith('.' + dominioRaiz) || dominioRegra === dominioRaiz) {
          return true;
        }
        
        // Verifica se contém o domínio (busca simples)
        return from.toLowerCase().includes(remLower);
      }
      
      // Se não começa com @, pode ser email completo ou domínio
      // Verifica email completo
      if (emailRemetente === remLower) return true;
      
      // Verifica domínio completo
      if (dominioCompleto === remLower) return true;
      
      // Verifica domínio raiz
      if (dominioRaiz === remLower) return true;
      
      // Verifica se contém (busca simples)
      return from.toLowerCase().includes(remLower);
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
 * Extrai domínio raiz de um domínio (remove subdomínios)
 * Exemplos:
 * - a.mercadopago.com -> mercadopago.com
 * - noreply.example.com -> example.com
 * - mail.google.com -> google.com
 * - subdomain.example.co.uk -> example.co.uk (preserva TLDs compostos)
 * @param {string} dominio - Domínio completo
 * @returns {string} Domínio raiz
 */
function extrairDominioRaiz(dominio) {
  if (!dominio || dominio.length === 0) return '';
  
  dominio = dominio.toLowerCase().trim();
  
  // Lista de TLDs compostos comuns (ex: co.uk, com.br, etc.)
  const tldsCompostos = [
    'co.uk', 'com.br', 'com.au', 'com.mx', 'com.ar', 'com.co',
    'net.br', 'org.br', 'gov.br', 'edu.br',
    'co.za', 'co.nz', 'co.jp', 'com.cn', 'com.tw',
    'com.sg', 'com.hk', 'com.my', 'com.ph', 'com.id',
    'com.vn', 'com.th', 'com.kr', 'com.in', 'com.tr'
  ];
  
  // Verifica se termina com TLD composto
  let tldComposto = null;
  for (const tld of tldsCompostos) {
    if (dominio.endsWith('.' + tld)) {
      tldComposto = tld;
      break;
    }
  }
  
  // Divide o domínio em partes
  let partes;
  if (tldComposto) {
    // Remove o TLD composto e divide o resto
    const dominioSemTld = dominio.slice(0, -(tldComposto.length + 1));
    partes = dominioSemTld.split('.');
    partes.push(tldComposto);
  } else {
    partes = dominio.split('.');
  }
  
  // Se tem menos de 2 partes, retorna como está
  if (partes.length < 2) return dominio;
  
  // Se tem 2 partes, já é o domínio raiz
  if (partes.length === 2) return dominio;
  
  // Se tem 3+ partes, pega as últimas 2 (ou 3 se TLD composto)
  if (tldComposto) {
    // Para TLDs compostos, pega as últimas 3 partes
    return partes.slice(-3).join('.');
  } else {
    // Para TLDs simples, pega as últimas 2 partes
    return partes.slice(-2).join('.');
  }
}

/**
 * Extrai domínio de um email ou campo From
 * @param {string} from - Campo From do header ou email completo
 * @param {boolean} usarDominioRaiz - Se true, retorna domínio raiz (sem subdomínios)
 * @returns {string} Domínio (ex: "exemplo.com" ou "a.exemplo.com")
 */
export function extrairDominio(from, usarDominioRaiz = false) {
  if (!from || typeof from !== 'string') return '';
  
  // Tenta extrair email primeiro - múltiplos padrões para maior compatibilidade
  let email = null;
  
  // Padrão 1: Email entre < > (ex: "Nome <email@domain.com>")
  const emailMatch1 = from.match(/<([^>]+)>/);
  if (emailMatch1) {
    email = emailMatch1[1].trim();
  } else {
    // Padrão 2: Email direto no formato user@domain.com
    const emailMatch2 = from.match(/([\w\.\+\-]+@[\w\.\-]+\.[\w\.\-]+)/i);
    if (emailMatch2) {
      email = emailMatch2[1].trim();
    } else {
      // Padrão 3: Se não encontrou, usa o próprio valor (pode ser só o email)
      email = from.trim();
    }
  }
  
  if (!email) return '';
  
  // Extrai domínio do email
  const dominioMatch = email.match(/@([^\s>]+)/);
  if (dominioMatch) {
    let dominio = dominioMatch[1].toLowerCase().trim();
    
    // Remove caracteres inválidos no final (parênteses, vírgulas, etc.)
    dominio = dominio.replace(/[^\w\.\-]+$/g, '');
    
    // Remove caracteres inválidos no início
    dominio = dominio.replace(/^[^\w\.\-]+/g, '');
    
    // Valida se é um domínio válido (deve ter pelo menos um ponto)
    if (!dominio.includes('.')) {
      return '';
    }
    
    // Se solicitado, retorna domínio raiz
    if (usarDominioRaiz) {
      return extrairDominioRaiz(dominio);
    }
    
    return dominio;
  }
  
  return '';
}

/**
 * Extrai nome do remetente de um email
 * @param {string} from - Campo From do header
 * @returns {string} Email do remetente
 */
export function extrairEmailRemetente(from) {
  const match = from.match(/<([^>]+)>/) || from.match(/([\w\.-]+@[\w\.-]+\.\w+)/);
  return match ? match[1].toLowerCase() : from.toLowerCase();
}

/**
 * Analisa remetentes frequentes na inbox (otimizado: apenas não lidas)
 * @param {number} limiteMinimo - Número mínimo de emails para considerar (padrão: 2)
 * @param {number} maxResultados - Máximo de resultados (padrão: 10)
 * @param {Function} callbackProgresso - Callback para atualizar progresso (processados, total, etapa)
 * @returns {Promise<Array>} Lista de remetentes frequentes com estatísticas
 */
export async function analisarRemetentesFrequentes(limiteMinimo = 2, maxResultados = 20, callbackProgresso = null) {
  try {
    console.log('[EmailZen] Iniciando análise otimizada de remetentes frequentes (apenas não lidas)...');
    console.log(`[EmailZen] Parâmetros: limiteMinimo=${limiteMinimo}, maxResultados=${maxResultados}`);
    
    // OTIMIZAÇÃO: Busca TODAS as mensagens NÃO LIDAS na inbox
    // Isso identifica remetentes que realmente precisam de organização
    let resultado = await buscarMensagens({
      query: 'in:inbox is:unread',
      maxResults: 500
    });
    
    // Busca TODAS as não lidas (sem limite artificial - processa todas que existem)
    let totalEmails = resultado.messages ? resultado.messages.length : 0;
    let tentativas = 0;
    const maxTentativas = 20; // Limite de segurança para evitar loop infinito
    
    // Busca todas as páginas de não lidas
    while (resultado.nextPageToken && tentativas < maxTentativas) {
      tentativas++;
      console.log(`[EmailZen] Buscando página ${tentativas + 1} de não lidas... (${totalEmails} emails até agora)`);
      
      const proximaPagina = await buscarMensagens({
        query: 'in:inbox is:unread',
        maxResults: 500,
        pageToken: resultado.nextPageToken
      });
      
      if (proximaPagina.messages && proximaPagina.messages.length > 0) {
        resultado.messages = [...(resultado.messages || []), ...proximaPagina.messages];
        resultado.nextPageToken = proximaPagina.nextPageToken;
        totalEmails = resultado.messages.length;
        
        // Pequeno delay para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 200));
      } else {
        break;
      }
    }
    
    console.log(`[EmailZen] Total de emails encontrados na inbox: ${totalEmails}`);
    
    if (!resultado.messages || resultado.messages.length === 0) {
      console.log('[EmailZen] Nenhum email encontrado para análise');
      if (callbackProgresso) {
        console.log('[EmailZen] Chamando callback com "Nenhum email encontrado"');
        callbackProgresso(0, 0, 'Nenhum email encontrado');
      }
      return [];
    }
    
    // Atualiza totalEmails com o valor final
    totalEmails = resultado.messages.length;
    console.log(`[EmailZen] Analisando ${totalEmails} emails...`);
    
    if (callbackProgresso) {
      console.log(`[EmailZen] Chamando callback inicial: 0/${totalEmails} - Iniciando análise...`);
      callbackProgresso(0, totalEmails, 'Iniciando análise...');
    }
    
    // Contador de remetentes
    const remetentesMap = new Map();
    let emailsProcessados = 0;
    let emailsComErro = 0;
    let emailsSemDominio = 0;
    
    // Processa em batches menores e de forma mais sequencial para evitar rate limit
    // Reduzido batch size de 50 para 10 para evitar muitas requisições simultâneas
    const batchSize = 10;
    for (let i = 0; i < resultado.messages.length; i += batchSize) {
      const batch = resultado.messages.slice(i, i + batchSize);
      
      // Processa de forma mais sequencial para evitar rate limit
      for (const msg of batch) {
        try {
          const mensagem = await obterMensagem(msg.id);
          const headers = {};
          mensagem.payload?.headers?.forEach(header => {
            headers[header.name.toLowerCase()] = header.value;
          });
          
          const from = headers.from || '';
          emailsProcessados++;
          
          if (from) {
            const email = extrairEmailRemetente(from);
            const dominioCompleto = extrairDominio(from, false);
            const dominioRaiz = extrairDominio(from, true);
            
            // Usa domínio raiz para agrupar subdomínios (ex: a.mercadopago.com -> mercadopago.com)
            const dominioParaAgrupar = dominioRaiz || dominioCompleto;
            
            if (dominioParaAgrupar && dominioParaAgrupar.length > 0) {
              // Inicializa ou atualiza contador do domínio
              const atual = remetentesMap.get(dominioParaAgrupar) || {
                dominio: dominioParaAgrupar,
                dominioCompleto: dominioCompleto,
                email: email,
                countNaoLidas: 0, // Contador de não lidas encontradas
                countTotal: 0, // Será preenchido depois com busca específica
                ultimoEmail: null,
                subdominios: new Set()
              };
              
              atual.countNaoLidas++;
              if (dominioCompleto && dominioCompleto !== dominioRaiz) {
                atual.subdominios.add(dominioCompleto);
              }
              
              if (!atual.ultimoEmail || msg.id > atual.ultimoEmail) {
                atual.ultimoEmail = msg.id;
              }
              remetentesMap.set(dominioParaAgrupar, atual);
            } else {
              emailsSemDominio++;
              // Log apenas a cada 100 emails sem domínio para não poluir o console
              if (emailsSemDominio % 100 === 0) {
                console.warn(`[EmailZen] ${emailsSemDominio} emails sem domínio extraído (último: ${from.substring(0, 50)})`);
              }
            }
          }
          
          // Pequeno delay entre cada requisição para evitar rate limit
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Atualiza progresso a cada 10 emails processados (para não sobrecarregar a UI)
          if (callbackProgresso && emailsProcessados % 10 === 0) {
            const abortar = callbackProgresso(emailsProcessados, totalEmails, `Analisando emails... ${emailsProcessados}/${totalEmails}`);
            if (abortar) {
              console.log('[EmailZen] Análise abortada pelo usuário');
              throw new Error('Análise abortada pelo usuário');
            }
          }
        } catch (error) {
          emailsComErro++;
          
          // Se foi abortado, propaga o erro
          if (error.message && error.message.includes('abortada')) {
            throw error;
          }
          
          // Se é erro 429, aguarda mais tempo antes de continuar
          if (error.message && error.message.includes('429')) {
            console.warn(`[EmailZen] Rate limit detectado. Aguardando 5 segundos antes de continuar...`);
            if (callbackProgresso) callbackProgresso(emailsProcessados, totalEmails, 'Rate limit detectado, aguardando...');
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          
          // Log apenas a cada 50 erros para não poluir o console
          if (emailsComErro % 50 === 0) {
            console.error(`[EmailZen] ${emailsComErro} erros ao processar mensagens (último: ${msg.id}):`, error.message || error);
          }
        }
      }
      
      // Log de progresso a cada 100 emails processados (usa emailsProcessados real, não índice)
      if (emailsProcessados % 100 === 0 || emailsProcessados >= totalEmails || (i + batchSize) >= resultado.messages.length) {
        console.log(`[EmailZen] Progresso: ${emailsProcessados}/${totalEmails} emails processados (${emailsComErro} erros)`);
        if (callbackProgresso) {
          const abortar = callbackProgresso(emailsProcessados, totalEmails, `Processando... ${emailsProcessados}/${totalEmails}`);
          if (abortar) {
            console.log('[EmailZen] Análise abortada pelo usuário');
            throw new Error('Análise abortada pelo usuário');
          }
        }
      }
      
      // Rate limiting maior entre batches para evitar rate limit
      if (i + batchSize < resultado.messages.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`[EmailZen] ${remetentesMap.size} domínios únicos encontrados nas não lidas`);
    
    // OTIMIZAÇÃO: Verifica regras existentes ANTES de contar mensagens
    // Se já existe regra para um remetente, não precisa contar (já está organizado)
    // Isso economiza muitas requisições à API
    if (callbackProgresso) {
      callbackProgresso(emailsProcessados, totalEmails, `Verificando regras existentes...`);
    }
    
    // Importa função para verificar regras (será passada como parâmetro ou importada)
    // Por enquanto, vamos buscar regras diretamente aqui
    let regrasExistentes = [];
    try {
      // Importa dinamicamente para evitar dependência circular
      const { obterRegras } = await import('../utils/storage.js');
      regrasExistentes = await obterRegras();
    } catch (error) {
      console.warn('[EmailZen] Não foi possível carregar regras existentes:', error);
    }
    
    // Cria mapa de domínios que já têm regras
    const dominiosComRegra = new Set();
    regrasExistentes.forEach(regra => {
      if (regra.ativa && regra.condicoes?.remetente) {
        regra.condicoes.remetente.forEach(rem => {
          let dominio = '';
          if (rem.startsWith('@')) {
            dominio = rem.substring(1).toLowerCase().trim();
          } else if (rem.includes('@')) {
            const partes = rem.split('@');
            if (partes.length > 1) {
              dominio = partes[1].toLowerCase().trim();
            }
          } else {
            dominio = rem.toLowerCase().trim();
          }
          if (dominio) {
            dominiosComRegra.add(dominio);
            // Também adiciona domínio raiz se possível
            const partes = dominio.split('.');
            if (partes.length >= 2) {
              const dominioRaiz = partes.slice(-2).join('.');
              dominiosComRegra.add(dominioRaiz);
            }
          }
        });
      }
    });
    
    console.log(`[EmailZen] ${dominiosComRegra.size} domínio(s) já possuem regras ativas`);
    
    // OTIMIZAÇÃO: Para cada domínio encontrado, busca o total de mensagens (lidas + não lidas) na inbox
    // MAS apenas se não tiver regra já existente
    if (callbackProgresso) {
      callbackProgresso(emailsProcessados, totalEmails, `Contando mensagens totais por remetente...`);
    }
    
    let dominiosProcessados = 0;
    let dominiosIgnorados = 0;
    const dominiosParaContar = Array.from(remetentesMap.keys());
    
    for (const dominio of dominiosParaContar) {
      try {
        // OTIMIZAÇÃO: Verifica se já existe regra para este domínio
        const temRegra = dominiosComRegra.has(dominio);
        
        // Verifica também se algum subdomínio tem regra
        let temRegraSubdominio = false;
        const partes = dominio.split('.');
        if (partes.length >= 2) {
          const dominioRaiz = partes.slice(-2).join('.');
          temRegraSubdominio = dominiosComRegra.has(dominioRaiz);
        }
        
        if (temRegra || temRegraSubdominio) {
          // Já tem regra, não precisa contar - usa apenas o count de não lidas como estimativa
          const remetente = remetentesMap.get(dominio);
          if (remetente) {
            remetente.countTotal = remetente.countNaoLidas; // Usa apenas não lidas como referência
            remetente.temRegra = true; // Marca que já tem regra
          }
          dominiosIgnorados++;
          console.log(`[EmailZen] Domínio ${dominio} já tem regra, pulando contagem total`);
          continue;
        }
        
        const remetente = remetentesMap.get(dominio);
        
        // Busca todas as mensagens (lidas + não lidas) deste remetente na inbox
        // Usa busca por domínio do remetente
        const buscaResultado = await buscarMensagens({
          query: `in:inbox from:${dominio}`,
          maxResults: 500 // Limita a 500 para não demorar muito
        });
        
        // Conta total de mensagens deste remetente
        let totalMensagens = buscaResultado.messages ? buscaResultado.messages.length : 0;
        
        // Se há mais páginas, tenta contar mais (mas limita para não demorar)
        if (buscaResultado.nextPageToken && totalMensagens < 500) {
          // Para otimizar, não busca todas as páginas, apenas estima
          // Se tem mais de 500, já é suficiente para sugerir
          totalMensagens = Math.max(totalMensagens, 500);
        }
        
        remetente.countTotal = totalMensagens || remetente.countNaoLidas; // Garante que sempre tenha um valor
        remetente.temRegra = false;
        remetentesMap.set(dominio, remetente);
        
        console.log(`[EmailZen] Domínio ${dominio}: ${totalMensagens} mensagens totais (${remetente.countNaoLidas} não lidas)`);
        
        dominiosProcessados++;
        
        // Atualiza progresso a cada 5 domínios
        if (callbackProgresso && dominiosProcessados % 5 === 0) {
          const abortar = callbackProgresso(
            emailsProcessados, 
            totalEmails, 
            `Contando mensagens... ${dominiosProcessados}/${dominiosParaContar.length - dominiosIgnorados} remetentes (${dominiosIgnorados} já têm regras)`
          );
          if (abortar) {
            throw new Error('Análise abortada pelo usuário');
          }
        }
        
        // Pequeno delay para não sobrecarregar API
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`[EmailZen] Erro ao contar mensagens do domínio ${dominio}:`, error);
        // Se der erro, usa apenas o count de não lidas
        const remetente = remetentesMap.get(dominio);
        if (remetente) {
          remetente.countTotal = remetente.countNaoLidas;
        }
      }
    }
    
    console.log(`[EmailZen] ${dominiosProcessados} domínios contados, ${dominiosIgnorados} ignorados (já têm regras)`);
    
    console.log(`[EmailZen] Análise concluída: ${emailsProcessados} não lidas processadas, ${emailsComErro} erros, ${emailsSemDominio} sem domínio`);
    
    // Debug: mostra todos os remetentes antes do filtro
    const todosRemetentes = Array.from(remetentesMap.values());
    console.log(`[EmailZen] Total de remetentes encontrados: ${todosRemetentes.length}`);
    console.log(`[EmailZen] Remetentes antes do filtro:`, todosRemetentes.slice(0, 10).map(r => ({
      dominio: r.dominio,
      countTotal: r.countTotal,
      countNaoLidas: r.countNaoLidas,
      temRegra: r.temRegra
    })));
    
    // Converte para array e filtra por limite mínimo (usa countTotal que inclui lidas + não lidas)
    // OTIMIZAÇÃO: Filtra também remetentes que já têm regras (não precisa sugerir novamente)
    const remetentesFrequentes = Array.from(remetentesMap.values())
      .filter(r => {
        // Filtra remetentes que já têm regras
        if (r.temRegra) {
          console.log(`[EmailZen] Remetente ${r.dominio} filtrado: já tem regra`);
          return false;
        }
        // Filtra pelo total (lidas + não lidas)
        const passaFiltro = r.countTotal >= limiteMinimo;
        if (!passaFiltro) {
          console.log(`[EmailZen] Remetente ${r.dominio} filtrado: countTotal (${r.countTotal}) < limiteMinimo (${limiteMinimo})`);
        }
        return passaFiltro;
      })
      .sort((a, b) => b.countTotal - a.countTotal) // Ordena pelo total
      .slice(0, maxResultados);
    
    console.log(`[EmailZen] Remetentes frequentes após filtro: ${remetentesFrequentes.length}`);
    
    const remetentesFrequentesMapeados = remetentesFrequentes.map(r => {
        const total = resultado.messages.length; // Total de não lidas analisadas
        const porcentagem = ((r.countTotal / Math.max(total, 1)) * 100).toFixed(1);
        
        // Informações sobre subdomínios encontrados
        const temSubdominios = r.subdominios && r.subdominios.size > 0;
        const subdominiosLista = temSubdominios ? Array.from(r.subdominios).slice(0, 3) : [];
        
        return {
          dominio: r.dominio,
          dominioCompleto: r.dominioCompleto,
          email: r.email,
          quantidade: r.countTotal, // Total de mensagens (lidas + não lidas)
          quantidadeNaoLidas: r.countNaoLidas, // Apenas não lidas encontradas
          porcentagem: porcentagem,
          temSubdominios: temSubdominios,
          subdominios: subdominiosLista,
          exemploSubdominios: temSubdominios ? `Ex: ${subdominiosLista.join(', ')}` : ''
        };
      });
    
    console.log(`[EmailZen] Encontrados ${remetentesFrequentesMapeados.length} remetentes frequentes:`, remetentesFrequentesMapeados);
    
    // Log detalhado para debug
    if (remetentesFrequentesMapeados.length === 0 && resultado.messages.length > 0) {
      console.log('[EmailZen] Debug: Nenhum remetente frequente encontrado, mas há emails. Verificando...');
      // Mostra top 10 domínios encontrados para debug
      const todosDominios = Array.from(remetentesMap.entries())
        .sort((a, b) => (b[1].countTotal || b[1].countNaoLidas) - (a[1].countTotal || a[1].countNaoLidas))
        .slice(0, 10);
      console.log('[EmailZen] Top 10 domínios encontrados:', todosDominios.map(([dom, info]) => ({
        dominio: dom,
        quantidadeTotal: info.countTotal || info.countNaoLidas,
        quantidadeNaoLidas: info.countNaoLidas,
        porcentagem: (((info.countTotal || info.countNaoLidas) / resultado.messages.length) * 100).toFixed(1) + '%'
      })));
      console.log(`[EmailZen] Limite mínimo atual: ${limiteMinimo} emails. Domínios com menos de ${limiteMinimo} emails foram filtrados.`);
    } else {
      // Mostra estatísticas dos remetentes encontrados
      console.log('[EmailZen] Estatísticas dos remetentes frequentes:');
      remetentesFrequentesMapeados.forEach((r, index) => {
        console.log(`  ${index + 1}. ${r.dominio}: ${r.quantidade} emails (${r.porcentagem}%)`);
      });
    }
    
    return remetentesFrequentesMapeados;
  } catch (error) {
    console.error('[EmailZen] Erro ao analisar remetentes:', error);
    throw error;
  }
}

