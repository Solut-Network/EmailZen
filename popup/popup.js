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
  
  // Trata erro de carregamento da logo
  const logoImg = document.getElementById('logo-solut');
  if (logoImg) {
    logoImg.onerror = function() {
      this.style.display = 'none';
    };
  }
  
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
  btn.textContent = 'Iniciando...';
  
  try {
    // Envia mensagem e não aguarda resposta - continua em background
    chrome.runtime.sendMessage({ acao: 'processarAgora' }, (response) => {
      // Callback opcional - não bloqueia se popup fechar
      if (chrome.runtime.lastError) {
        console.log('[EmailZen] Popup fechado, mas processamento continua em background');
        return;
      }
      
      if (response && response.sucesso) {
        console.log('[EmailZen] Processamento iniciado com sucesso');
        // Atualiza estatísticas se popup ainda estiver aberto
        if (document.getElementById('stat-processados')) {
          carregarEstatisticas();
        }
      }
    });
    
    mostrarStatus('Processamento iniciado em background!', 'autenticado');
    
    // Atualiza estatísticas após um pequeno delay
    setTimeout(async () => {
      if (document.getElementById('stat-processados')) {
        await carregarEstatisticas();
      }
    }, 2000);
    
  } catch (error) {
    console.error('Erro ao iniciar processamento:', error);
    mostrarStatus('Erro ao iniciar processamento', 'nao-autenticado');
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
  btn.textContent = 'Iniciando...';
  
  try {
    // Envia mensagem e aguarda resposta, mas continua mesmo se popup fechar
    chrome.runtime.sendMessage({ acao: 'analisarSugestoes' }, async (response) => {
      // Callback - continua mesmo se popup fechar
      if (chrome.runtime.lastError) {
        console.log('[EmailZen] Popup fechado, mas análise continua em background');
        return;
      }
      
      try {
        if (response && response.sucesso && response.sugestoes && response.sugestoes.length > 0) {
          // Salva as sugestões para persistir entre abas
          await salvarSugestoes(response.sugestoes);
          
          // Atualiza interface se popup ainda estiver aberto
          if (document.getElementById('sugestoes-lista')) {
            mostrarSugestoes(response.sugestoes);
            mostrarStatus('Análise concluída!', 'autenticado');
          }
        } else if (response) {
          // Salva sugestões vazias se não houver resultados
          await salvarSugestoes([]);
          
          // Mostra mensagem apenas se popup ainda estiver aberto
          if (document.getElementById('sugestoes-lista')) {
            const mensagem = response.erro 
              ? `Erro: ${response.erro}\n\nVerifique o console do Service Worker para mais detalhes.`
              : 'Nenhuma sugestão encontrada.\n\nIsso pode acontecer se:\n- Não há remetentes com 2+ emails na inbox\n- Todos os remetentes já têm regras criadas\n- A inbox está vazia\n\nVerifique o console do Service Worker (chrome://extensions > Detalhes > Inspecionar visualizações > service-worker) para mais informações.';
            alert(mensagem);
          }
        }
      } catch (error) {
        console.error('[EmailZen] Erro ao processar resposta da análise:', error);
      }
    });
    
    mostrarStatus('Análise iniciada em background...', 'autenticado');
    
  } catch (error) {
    console.error('Erro ao iniciar análise:', error);
    mostrarStatus('Erro ao iniciar análise', 'nao-autenticado');
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
      // Mostra informação sobre subdomínios se houver
      const infoSubdominios = sugestao.temSubdominios && sugestao.exemploSubdominios
        ? `<span class="sugestao-subdominios" title="Inclui subdomínios: ${sugestao.subdominios.join(', ')}">${sugestao.exemploSubdominios}</span>`
        : '';
      
      card.innerHTML = `
        <div class="sugestao-info">
          <div>
            <strong class="sugestao-dominio">${sugestao.dominio}</strong>
            ${infoSubdominios}
          </div>
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
    // Envia mensagem e continua mesmo se popup fechar
    chrome.runtime.sendMessage({
      acao: 'criarRegraAutomatica',
      sugestao: sugestao,
      opcoes: {
        marcarLido: true,
        arquivar: false
      }
    }, async (response) => {
      // Callback - continua mesmo se popup fechar
      if (chrome.runtime.lastError) {
        console.log('[EmailZen] Popup fechado, mas criação de regra continua em background');
        return;
      }
      
      try {
        if (response && response.sucesso) {
          // Remove a sugestão da lista salva
          const sugestoesAtuais = await obterSugestoes();
          const sugestoesAtualizadas = sugestoesAtuais.filter(s => s.dominio !== sugestao.dominio);
          await salvarSugestoes(sugestoesAtualizadas);
          
          // Atualiza interface se popup ainda estiver aberto
          if (document.getElementById('sugestoes-lista')) {
            // Mantém o filtro de busca se houver
            const searchInput = document.getElementById('sugestoes-search');
            const termoBusca = searchInput ? searchInput.value : '';
            mostrarSugestoes(sugestoesAtualizadas, termoBusca);
            
            mostrarStatus('Regra criada com sucesso!', 'autenticado');
            await carregarEstatisticas();
          }
        } else if (response && document.getElementById('sugestoes-lista')) {
          // Mostra erro apenas se popup ainda estiver aberto
          alert('Erro ao criar regra: ' + (response.erro || 'Erro desconhecido'));
        }
      } catch (error) {
        console.error('[EmailZen] Erro ao processar resposta da criação de regra:', error);
      }
    });
    
    // Mostra status imediatamente
    mostrarStatus('Criando regra em background...', 'autenticado');
    
  } catch (error) {
    console.error('Erro ao iniciar criação de regra:', error);
    mostrarStatus('Erro ao criar regra', 'nao-autenticado');
  }
}

// Inicializa quando popup abre
inicializar();

