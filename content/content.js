/**
 * Content Script - Injeta painel lateral no Gmail
 * Nota: Content scripts não suportam ES modules, então usamos chrome.runtime.sendMessage
 */

let painelCriado = false;
let painelAberto = false;

/**
 * Cria o painel lateral
 */
function criarPainel() {
  if (painelCriado) return;
  
  const painel = document.createElement('div');
  painel.id = 'gmail-organizer-painel';
  
  painel.innerHTML = `
    <div id="gmail-organizer-painel-header">
      <h2>📧 Gmail Organizer</h2>
      <button id="gmail-organizer-toggle" title="Fechar painel">
        <svg viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
    <div id="gmail-organizer-conteudo">
      <div class="gmail-organizer-loading">Carregando categorias...</div>
    </div>
  `;
  
  document.body.appendChild(painel);
  painelCriado = true;
  
  // Event listeners
  document.getElementById('gmail-organizer-toggle').addEventListener('click', () => {
    fecharPainel();
  });
  
  // Carrega dados
  carregarCategorias();
}

/**
 * Cria botão flutuante para abrir painel
 */
function criarBotaoFlutuante() {
  if (document.getElementById('gmail-organizer-botao-flutuante')) return;
  
  const botao = document.createElement('div');
  botao.id = 'gmail-organizer-botao-flutuante';
  botao.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
    </svg>
  `;
  
  botao.addEventListener('click', () => {
    abrirPainel();
  });
  
  document.body.appendChild(botao);
}

/**
 * Abre o painel
 */
function abrirPainel() {
  const painel = document.getElementById('gmail-organizer-painel');
  if (painel) {
    painel.classList.add('aberto');
    painelAberto = true;
    
    const botaoFlutuante = document.getElementById('gmail-organizer-botao-flutuante');
    if (botaoFlutuante) {
      botaoFlutuante.classList.add('oculto');
    }
  }
}

/**
 * Fecha o painel
 */
function fecharPainel() {
  const painel = document.getElementById('gmail-organizer-painel');
  if (painel) {
    painel.classList.remove('aberto');
    painelAberto = false;
    
    const botaoFlutuante = document.getElementById('gmail-organizer-botao-flutuante');
    if (botaoFlutuante) {
      botaoFlutuante.classList.remove('oculto');
    }
  }
}

/**
 * Carrega e exibe categorias
 */
async function carregarCategorias() {
  const conteudo = document.getElementById('gmail-organizer-conteudo');
  if (!conteudo) return;
  
  try {
    // Busca regras via mensagem para o background
    const response = await chrome.runtime.sendMessage({ acao: 'obterRegras' });
    const regras = response?.regras || [];
    const regrasAtivas = regras.filter(r => r.ativa && r.acoes?.label);
    
    if (regrasAtivas.length === 0) {
      conteudo.innerHTML = `
        <div class="gmail-organizer-vazio">
          <p>Nenhuma categoria configurada ainda.</p>
          <p style="margin-top: 16px; font-size: 12px; color: #5f6368;">
            Configure regras na página de opções da extensão.
          </p>
          <button class="gmail-organizer-botao" onclick="window.open(chrome.runtime.getURL('options/options.html'), '_blank')">
            Abrir Configurações
          </button>
        </div>
      `;
      return;
    }
    
    // Agrupa por label
    const categorias = {};
    regrasAtivas.forEach(regra => {
      const label = regra.acoes.label;
      if (!categorias[label]) {
        categorias[label] = {
          nome: label,
          regras: []
        };
      }
      categorias[label].regras.push(regra);
    });
    
    // Busca contadores de emails (simplificado - pode melhorar)
    let html = '<div class="gmail-organizer-secao">';
    html += '<h3>Categorias</h3>';
    
    for (const [label, categoria] of Object.entries(categorias)) {
      // Busca contador via Gmail API (simplificado)
      const contador = await buscarContadorEmails(label);
      
      html += `
        <div class="gmail-organizer-categoria" data-label="${label}">
          <span class="gmail-organizer-categoria-nome">${label}</span>
          <span class="gmail-organizer-categoria-contador">${contador}</span>
        </div>
      `;
    }
    
    html += '</div>';
    
    html += `
      <div class="gmail-organizer-secao">
        <button class="gmail-organizer-botao" id="processar-agora">
          Processar Emails Agora
        </button>
        <button class="gmail-organizer-botao gmail-organizer-botao-secundario" onclick="window.open(chrome.runtime.getURL('options/options.html'), '_blank')">
          Configurações
        </button>
      </div>
    `;
    
    conteudo.innerHTML = html;
    
    // Event listeners
    document.getElementById('processar-agora')?.addEventListener('click', async () => {
      const botao = document.getElementById('processar-agora');
      botao.disabled = true;
      botao.textContent = 'Processando...';
      
      try {
        const response = await chrome.runtime.sendMessage({ acao: 'processarAgora' });
        if (response.sucesso) {
          mostrarStatus('Emails processados com sucesso!', 'sucesso');
          await carregarCategorias(); // Recarrega contadores
        } else {
          mostrarStatus('Erro ao processar: ' + (response.erro || 'Erro desconhecido'), 'erro');
        }
      } catch (error) {
        mostrarStatus('Erro ao processar: ' + error.message, 'erro');
      } finally {
        botao.disabled = false;
        botao.textContent = 'Processar Emails Agora';
      }
    });
    
    // Click em categoria para filtrar
    document.querySelectorAll('.gmail-organizer-categoria').forEach(cat => {
      cat.addEventListener('click', () => {
        const label = cat.dataset.label;
        filtrarPorLabel(label);
      });
    });
    
  } catch (error) {
    console.error('Erro ao carregar categorias:', error);
    conteudo.innerHTML = `
      <div class="gmail-organizer-status erro">
        Erro ao carregar categorias: ${error.message}
      </div>
    `;
  }
}

/**
 * Busca contador de emails para um label (simplificado)
 */
async function buscarContadorEmails(label) {
  try {
    // Envia mensagem para background script buscar
    const response = await chrome.runtime.sendMessage({
      acao: 'buscarContador',
      label: label
    });
    return response?.contador || 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Filtra inbox por label
 */
function filtrarPorLabel(label) {
  // Navega para a busca do Gmail com o label
  const url = new URL(window.location.href);
  url.searchParams.set('search', `label:${label}`);
  window.location.href = url.toString();
}

/**
 * Mostra mensagem de status
 */
function mostrarStatus(mensagem, tipo = 'info') {
  const conteudo = document.getElementById('gmail-organizer-conteudo');
  if (!conteudo) return;
  
  const status = document.createElement('div');
  status.className = `gmail-organizer-status ${tipo}`;
  status.textContent = mensagem;
  
  conteudo.insertBefore(status, conteudo.firstChild);
  
  setTimeout(() => {
    status.remove();
  }, 5000);
}

/**
 * Inicialização
 */
function inicializar() {
  // Aguarda Gmail carregar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(criarPainel, 2000);
      setTimeout(criarBotaoFlutuante, 2000);
    });
  } else {
    setTimeout(criarPainel, 2000);
    setTimeout(criarBotaoFlutuante, 2000);
  }
}

// Inicializa
inicializar();

// Listener para mensagens do background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.acao === 'atualizarPainel') {
    carregarCategorias();
    sendResponse({ sucesso: true });
  }
});

