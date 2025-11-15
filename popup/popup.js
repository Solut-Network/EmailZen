/**
 * Popup Script - Interface do ícone da extensão
 */

import { obterToken, removerToken } from '../utils/storage.js';
import { obterTokenOAuth, fazerLogout } from '../utils/gmail-api.js';
import { obterEstatisticas } from '../utils/storage.js';

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

// Inicializa quando popup abre
inicializar();

