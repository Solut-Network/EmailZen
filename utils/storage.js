/**
 * Utilitário para gerenciamento de dados usando Chrome Storage API
 */

/**
 * Salva uma regra de filtro
 * @param {Object} regra - Objeto com nome, condições e ações
 * @returns {Promise<string>} ID da regra criada
 */
export async function salvarRegra(regra) {
  const { regras = [] } = await chrome.storage.local.get(['regras']);
  
  // Se tem ID, atualiza; senão, cria nova
  if (regra.id) {
    const index = regras.findIndex(r => r.id === regra.id);
    if (index !== -1) {
      regras[index] = { ...regra, atualizadoEm: Date.now() };
    }
  } else {
    const novaRegra = {
      id: `regra_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...regra,
      ativa: regra.ativa !== undefined ? regra.ativa : true,
      criadoEm: Date.now(),
      atualizadoEm: Date.now()
    };
    regras.push(novaRegra);
  }
  
  await chrome.storage.local.set({ regras });
  return regras[regras.length - 1].id;
}

/**
 * Obtém todas as regras salvas
 * @returns {Promise<Array>} Lista de regras
 */
export async function obterRegras() {
  const { regras = [] } = await chrome.storage.local.get(['regras']);
  return regras;
}

/**
 * Remove uma regra pelo ID
 * @param {string} regraId - ID da regra
 */
export async function removerRegra(regraId) {
  const { regras = [] } = await chrome.storage.local.get(['regras']);
  const regrasFiltradas = regras.filter(r => r.id !== regraId);
  await chrome.storage.local.set({ regras: regrasFiltradas });
}

/**
 * Ativa/desativa uma regra
 * @param {string} regraId - ID da regra
 * @param {boolean} ativa - Status desejado
 */
export async function toggleRegra(regraId, ativa) {
  const { regras = [] } = await chrome.storage.local.get(['regras']);
  const regra = regras.find(r => r.id === regraId);
  if (regra) {
    regra.ativa = ativa;
    regra.atualizadoEm = Date.now();
    await chrome.storage.local.set({ regras });
  }
}

/**
 * Salva token de acesso OAuth
 * @param {string} token - Token de acesso
 */
export async function salvarToken(token) {
  await chrome.storage.local.set({ 
    oauthToken: token,
    tokenSalvoEm: Date.now()
  });
}

/**
 * Obtém token de acesso salvo
 * @returns {Promise<string|null>} Token ou null
 */
export async function obterToken() {
  const { oauthToken } = await chrome.storage.local.get(['oauthToken']);
  return oauthToken || null;
}

/**
 * Remove token de acesso (logout)
 */
export async function removerToken() {
  await chrome.storage.local.remove(['oauthToken', 'tokenSalvoEm']);
}

/**
 * Salva estatísticas de processamento
 * @param {Object} stats - Estatísticas (emailsProcessados, espacoEconomizado, etc)
 */
export async function salvarEstatisticas(stats) {
  try {
    const { estatisticas = {} } = await chrome.storage.local.get(['estatisticas']);
    
    // Preserva valores existentes e atualiza apenas os novos
    const novasStats = {
      emailsProcessados: estatisticas.emailsProcessados || 0,
      emailsExcluidos: estatisticas.emailsExcluidos || 0,
      espacoEconomizado: estatisticas.espacoEconomizado || 0,
      ...stats, // Sobrescreve com novos valores
      ultimaAtualizacao: Date.now()
    };
    
    // Se está incrementando, soma ao valor existente
    if (stats.emailsProcessados !== undefined && typeof stats.emailsProcessados === 'number') {
      // Se o valor passado já é um incremento, não precisa somar novamente
      // (o service worker já faz a soma antes de chamar esta função)
      novasStats.emailsProcessados = stats.emailsProcessados;
    }
    
    if (stats.emailsExcluidos !== undefined && typeof stats.emailsExcluidos === 'number') {
      novasStats.emailsExcluidos = stats.emailsExcluidos;
    }
    
    await chrome.storage.local.set({ estatisticas: novasStats });
    console.log('[EmailZen] Estatísticas salvas:', novasStats);
  } catch (error) {
    console.error('[EmailZen] Erro ao salvar estatísticas:', error);
    throw error;
  }
}

/**
 * Obtém estatísticas salvas
 * @returns {Promise<Object>} Estatísticas
 */
export async function obterEstatisticas() {
  try {
    const { estatisticas = {} } = await chrome.storage.local.get(['estatisticas']);
    
    // Garante que os valores são números e não são perdidos
    const stats = {
      emailsProcessados: Number(estatisticas.emailsProcessados) || 0,
      emailsExcluidos: Number(estatisticas.emailsExcluidos) || 0,
      espacoEconomizado: Number(estatisticas.espacoEconomizado) || 0,
      ultimaAtualizacao: estatisticas.ultimaAtualizacao || null
    };
    
    console.log('[EmailZen] Estatísticas recuperadas do storage:', stats);
    return stats;
  } catch (error) {
    console.error('[EmailZen] Erro ao obter estatísticas:', error);
    // Retorna valores padrão em caso de erro
    return {
      emailsProcessados: 0,
      emailsExcluidos: 0,
      espacoEconomizado: 0,
      ultimaAtualizacao: null
    };
  }
}

/**
 * Adiciona entrada ao histórico de processamento
 * @param {Object} entrada - Dados da entrada (acao, emailId, regraId, etc)
 */
export async function adicionarHistorico(entrada) {
  const { historico = [] } = await chrome.storage.local.get(['historico']);
  
  historico.push({
    ...entrada,
    timestamp: Date.now()
  });
  
  // Manter apenas últimos 7 dias
  const seteDiasAtras = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const historicoFiltrado = historico.filter(h => h.timestamp > seteDiasAtras);
  
  await chrome.storage.local.set({ historico: historicoFiltrado });
}

/**
 * Obtém histórico de processamento
 * @returns {Promise<Array>} Lista de entradas do histórico
 */
export async function obterHistorico() {
  const { historico = [] } = await chrome.storage.local.get(['historico']);
  return historico.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Salva cache de labels do Gmail
 * @param {Array} labels - Lista de labels
 */
export async function salvarLabelsCache(labels) {
  await chrome.storage.local.set({ 
    labelsCache: labels,
    labelsCacheAtualizado: Date.now()
  });
}

/**
 * Obtém labels em cache
 * @returns {Promise<Array>} Lista de labels
 */
export async function obterLabelsCache() {
  const { labelsCache = [] } = await chrome.storage.local.get(['labelsCache']);
  return labelsCache;
}

/**
 * Salva sugestões de regras inteligentes
 * @param {Array} sugestoes - Lista de sugestões
 */
export async function salvarSugestoes(sugestoes) {
  await chrome.storage.local.set({ 
    sugestoesInteligentes: sugestoes,
    sugestoesSalvasEm: Date.now()
  });
}

/**
 * Obtém sugestões salvas
 * @returns {Promise<Array>} Lista de sugestões
 */
export async function obterSugestoes() {
  const { sugestoesInteligentes = [] } = await chrome.storage.local.get(['sugestoesInteligentes']);
  return sugestoesInteligentes;
}

/**
 * Remove sugestões salvas
 */
export async function limparSugestoes() {
  await chrome.storage.local.remove(['sugestoesInteligentes', 'sugestoesSalvasEm']);
}

/**
 * Salva configurações de verificação automática
 * @param {Object} config - Configurações (ativa, intervaloMinutos)
 */
export async function salvarConfigVerificacao(config) {
  await chrome.storage.local.set({ 
    configVerificacao: {
      ativa: config.ativa !== undefined ? config.ativa : true,
      intervaloMinutos: config.intervaloMinutos || 5,
      atualizadoEm: Date.now()
    }
  });
}

/**
 * Obtém configurações de verificação automática
 * @returns {Promise<Object>} Configurações (ativa, intervaloMinutos)
 */
export async function obterConfigVerificacao() {
  const { configVerificacao } = await chrome.storage.local.get(['configVerificacao']);
  return {
    ativa: configVerificacao?.ativa !== undefined ? configVerificacao.ativa : true,
    intervaloMinutos: configVerificacao?.intervaloMinutos || 5
  };
}

