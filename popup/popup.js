/**
 * Popup Script - Interface do ícone da extensão
 */

import { obterToken, removerToken, obterEstatisticas, salvarSugestoes, obterSugestoes, limparSugestoes } from '../utils/storage.js';
import { obterTokenOAuth, fazerLogout } from '../utils/gmail-api.js';

let autenticado = false;

/**
 * Inicializa o popup
 */
async function inicializar() {
  mostrarLoading(true);
  
  try {
    const token = await obterToken();
    autenticado = !!token;
    
    atualizarInterface();
    
    if (autenticado) {
      await carregarEstatisticas();
      await carregarSugestoesSalvas();
    }
  } catch (error) {
    console.error('Erro ao inicializar popup:', error);
    mostrarStatus('Erro ao carregar', 'nao-autenticado');
  } finally {
    mostrarLoading(false);
  }
}

/**
 * Atualiza interface baseado no status de autenticação
 */
function atualizarInterface() {
  const authContainer = document.getElementById('auth-container');
  const mainContainer = document.getElementById('main-container');
  const statusText = document.getElementById('status-text');
  
  if (autenticado) {
    authContainer.classList.add('hidden');
    mainContainer.classList.remove('hidden');
    statusText.textContent = 'Autenticado';
    statusText.classList.add('autenticado');
    statusText.classList.remove('nao-autenticado');
  } else {
    authContainer.classList.remove('hidden');
    mainContainer.classList.add('hidden');
    statusText.textContent = 'Não autenticado';
    statusText.classList.add('nao-autenticado');
    statusText.classList.remove('autenticado');
  }
}

/**
 * Carrega e exibe estatísticas
 */
async function carregarEstatisticas() {
  try {
    const stats = await obterEstatisticas();
    document.getElementById('stat-processados').textContent = stats.emailsProcessados || 0;
    document.getElementById('stat-excluidos').textContent = stats.emailsExcluidos || 0;
  } catch (error) {
    console.error('Erro ao carregar estatísticas:', error);
  }
}

/**
 * Carrega sugestões salvas e exibe na interface
 */
async function carregarSugestoesSalvas() {
  try {
    const sugestoes = await obterSugestoes();
    if (sugestoes && sugestoes.length > 0) {
      // Limpa o campo de busca ao carregar
      const searchInput = document.getElementById('sugestoes-search');
      if (searchInput) {
        searchInput.value = '';
      }
      mostrarSugestoes(sugestoes, '');
    }
  } catch (error) {
    console.error('Erro ao carregar sugestões salvas:', error);
  }
}

/**
 * Mostra/oculta loading
 */
function mostrarLoading(mostrar) {
  const loadingContainer = document.getElementById('loading-container');
  const authContainer = document.getElementById('auth-container');
  const mainContainer = document.getElementById('main-container');
  
  if (mostrar) {
    loadingContainer.classList.remove('hidden');
    authContainer.classList.add('hidden');
    mainContainer.classList.add('hidden');
  } else {
    loadingContainer.classList.add('hidden');
  }
}

/**
 * Mostra status
 */
function mostrarStatus(texto, tipo) {
  const statusText = document.getElementById('status-text');
  statusText.textContent = texto;
  statusText.className = `status-value ${tipo}`;
}

/**
 * Event listeners
 */
document.getElementById('btn-autenticar')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-autenticar');
  btn.disabled = true;
  btn.textContent = 'Autenticando...';
  
  try {
    await obterTokenOAuth();
    autenticado = true;
    atualizarInterface();
    await carregarEstatisticas();
    mostrarStatus('Autenticado com sucesso!', 'autenticado');
  } catch (error) {
    console.error('Erro na autenticação:', error);
    mostrarStatus('Erro na autenticação', 'nao-autenticado');
    alert('Erro ao autenticar: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Autenticar com Google';
  }
});

document.getElementById('btn-processar')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-processar');
  btn.disabled = true;
  btn.textContent = 'Processando...';
  
  try {
    const response = await chrome.runtime.sendMessage({ acao: 'processarAgora' });
    if (response.sucesso) {
      mostrarStatus('Processamento iniciado!', 'autenticado');
      await carregarEstatisticas();
    } else {
      alert('Erro ao processar: ' + (response.erro || 'Erro desconhecido'));
    }
  } catch (error) {
    console.error('Erro ao processar:', error);
    alert('Erro ao processar: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Processar Agora';
  }
});

document.getElementById('btn-opcoes')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('btn-limpar-sugestoes')?.addEventListener('click', async () => {
  if (confirm('Deseja limpar todas as sugestões salvas?')) {
    await limparSugestoesSalvas();
  }
});

// Campo de pesquisa de sugestões
document.getElementById('sugestoes-search')?.addEventListener('input', (e) => {
  const termoBusca = e.target.value;
  mostrarSugestoes(todasSugestoes, termoBusca);
});

document.getElementById('btn-analisar')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-analisar');
  btn.disabled = true;
  btn.textContent = 'Analisando...';
  
  try {
    const response = await chrome.runtime.sendMessage({ acao: 'analisarSugestoes' });
    if (response.sucesso && response.sugestoes && response.sugestoes.length > 0) {
      // Salva as sugestões para persistir entre abas
      await salvarSugestoes(response.sugestoes);
      mostrarSugestoes(response.sugestoes);
      mostrarStatus('Análise concluída!', 'autenticado');
    } else {
      const mensagem = response.erro 
        ? `Erro: ${response.erro}\n\nVerifique o console do Service Worker para mais detalhes.`
        : 'Nenhuma sugestão encontrada.\n\nIsso pode acontecer se:\n- Não há remetentes com 2+ emails na inbox\n- Todos os remetentes já têm regras criadas\n- A inbox está vazia\n\nVerifique o console do Service Worker (chrome://extensions > Detalhes > Inspecionar visualizações > service-worker) para mais informações.';
      alert(mensagem);
    }
  } catch (error) {
    console.error('Erro ao analisar:', error);
    alert('Erro ao analisar inbox: ' + error.message + '\n\nVerifique o console do Service Worker para mais detalhes.');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Analisar Inbox';
  }
});

// Armazena todas as sugestões para filtragem
let todasSugestoes = [];

/**
 * Mostra sugestões de regras na interface
 */
function mostrarSugestoes(sugestoes, termoBusca = '') {
  const sugestoesSection = document.getElementById('sugestoes-section');
  const sugestoesLista = document.getElementById('sugestoes-lista');
  const sugestoesEmpty = document.getElementById('sugestoes-empty');
  const searchTermSpan = document.getElementById('search-term');
  
  if (!sugestoes || sugestoes.length === 0) {
    sugestoesSection.classList.add('hidden');
    return;
  }
  
  // Salva todas as sugestões para filtragem
  todasSugestoes = sugestoes;
  
  sugestoesSection.classList.remove('hidden');
  sugestoesLista.innerHTML = '';
  
  // Filtra sugestões se houver termo de busca
  let sugestoesFiltradas = sugestoes;
  if (termoBusca && termoBusca.trim() !== '') {
    const termo = termoBusca.toLowerCase().trim();
    sugestoesFiltradas = sugestoes.filter(s => 
      s.dominio.toLowerCase().includes(termo) ||
      (s.email && s.email.toLowerCase().includes(termo))
    );
  }
  
  // Mostra mensagem se não encontrou resultados
  if (sugestoesFiltradas.length === 0 && termoBusca.trim() !== '') {
    sugestoesLista.classList.add('hidden');
    sugestoesEmpty.classList.remove('hidden');
    searchTermSpan.textContent = termoBusca;
  } else {
    sugestoesLista.classList.remove('hidden');
    sugestoesEmpty.classList.add('hidden');
    
    sugestoesFiltradas.forEach(sugestao => {
      const card = document.createElement('div');
      card.className = 'sugestao-card';
      card.setAttribute('data-dominio', sugestao.dominio);
      card.innerHTML = `
        <div class="sugestao-info">
          <strong class="sugestao-dominio">${sugestao.dominio}</strong>
          <span class="sugestao-stats">${sugestao.quantidade} emails (${sugestao.porcentagem}%)</span>
        </div>
        <button class="btn-sugestao" data-dominio="${sugestao.dominio}" data-quantidade="${sugestao.quantidade}">
          Criar Regra
        </button>
      `;
      
      const btnCriar = card.querySelector('.btn-sugestao');
      btnCriar.addEventListener('click', async () => {
        await criarRegraDaSugestao(sugestao);
      });
      
      sugestoesLista.appendChild(card);
    });
  }
}

/**
 * Limpa sugestões salvas
 */
async function limparSugestoesSalvas() {
  await limparSugestoes();
  todasSugestoes = [];
  const sugestoesSection = document.getElementById('sugestoes-section');
  const searchInput = document.getElementById('sugestoes-search');
  if (searchInput) {
    searchInput.value = '';
  }
  sugestoesSection.classList.add('hidden');
  mostrarStatus('Sugestões limpas', 'autenticado');
}

/**
 * Cria regra a partir de uma sugestão
 */
async function criarRegraDaSugestao(sugestao) {
  try {
    const response = await chrome.runtime.sendMessage({
      acao: 'criarRegraAutomatica',
      sugestao: sugestao,
      opcoes: {
        marcarLido: true,
        arquivar: false
      }
    });
    
    if (response.sucesso) {
      // Remove a sugestão da lista salva
      const sugestoesAtuais = await obterSugestoes();
      const sugestoesAtualizadas = sugestoesAtuais.filter(s => s.dominio !== sugestao.dominio);
      await salvarSugestoes(sugestoesAtualizadas);
      
      // Mantém o filtro de busca se houver
      const searchInput = document.getElementById('sugestoes-search');
      const termoBusca = searchInput ? searchInput.value : '';
      mostrarSugestoes(sugestoesAtualizadas, termoBusca);
      
      mostrarStatus('Regra criada com sucesso!', 'autenticado');
      await carregarEstatisticas();
    } else {
      alert('Erro ao criar regra: ' + (response.erro || 'Erro desconhecido'));
    }
  } catch (error) {
    console.error('Erro ao criar regra:', error);
    alert('Erro ao criar regra: ' + error.message);
  }
}

// Inicializa quando popup abre
inicializar();

