/**
 * Options Page Script - Gerenciamento de regras
 */

import { obterRegras, salvarRegra, removerRegra, toggleRegra, obterEstatisticas, salvarConfigVerificacao, obterConfigVerificacao } from '../utils/storage.js';

let regraEditando = null;
let regrasSelecionadas = new Set();
let todasRegras = [];

/**
 * Inicializa a página
 */
async function inicializar() {
  // Trata erro de carregamento da logo
  const logoImg = document.querySelector('.logo-solut');
  if (logoImg) {
    logoImg.onerror = function() {
      this.style.display = 'none';
    };
  }
  
  await carregarRegras();
  await carregarEstatisticas();
  await carregarConfigVerificacao();
  
  // Event listeners
  document.getElementById('btn-executar-regras').addEventListener('click', () => {
    executarRegras();
  });
  
  document.getElementById('btn-nova-regra').addEventListener('click', () => {
    abrirModalRegra();
  });
  
  document.getElementById('modal-fechar').addEventListener('click', () => {
    fecharModalRegra();
  });
  
  document.getElementById('btn-cancelar').addEventListener('click', () => {
    fecharModalRegra();
  });
  
  document.getElementById('form-regra').addEventListener('submit', async (e) => {
    e.preventDefault();
    await salvarRegraForm();
  });
  
  // Event listeners para pesquisa e seleção
  document.getElementById('regras-search')?.addEventListener('input', (e) => {
    regrasSelecionadas.clear();
    atualizarSelecao();
    carregarRegras(e.target.value);
  });
  
  document.getElementById('btn-selecionar-todas')?.addEventListener('click', () => {
    selecionarTodasRegras();
  });
  
  document.getElementById('btn-deselecionar-todas')?.addEventListener('click', () => {
    deselecionarTodasRegras();
  });
  
  // Checkbox do cabeçalho para selecionar todas
  document.getElementById('checkbox-selecionar-todas')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      selecionarTodasRegras();
    } else {
      deselecionarTodasRegras();
    }
  });
  
  document.getElementById('btn-executar-selecionadas')?.addEventListener('click', () => {
    executarRegrasSelecionadas();
  });
  
  document.getElementById('btn-desativar-selecionadas')?.addEventListener('click', () => {
    desativarRegrasSelecionadas();
  });
  
  document.getElementById('btn-excluir-selecionadas')?.addEventListener('click', () => {
    excluirRegrasSelecionadas();
  });
  
  // Botão salvar configurações de verificação
  document.getElementById('btn-salvar-config')?.addEventListener('click', salvarConfigVerificacaoForm);
}

/**
 * Carrega e exibe regras
 */
async function carregarRegras(termoBusca = '') {
  const lista = document.getElementById('regras-lista');
  lista.innerHTML = '<div class="loading">Carregando regras...</div>';
  
  try {
    const regras = await obterRegras();
    todasRegras = regras; // Salva para filtragem
    
    // Filtra regras se houver termo de busca
    let regrasFiltradas = regras;
    if (termoBusca && termoBusca.trim() !== '') {
      const termo = termoBusca.toLowerCase().trim();
      regrasFiltradas = regras.filter(regra => {
        const nome = regra.nome?.toLowerCase() || '';
        const remetente = regra.condicoes?.remetente?.join(' ')?.toLowerCase() || '';
        const label = regra.acoes?.label?.toLowerCase() || '';
        return nome.includes(termo) || remetente.includes(termo) || label.includes(termo);
      });
    }
    
    if (regrasFiltradas.length === 0) {
      lista.innerHTML = `
        <div class="vazio" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
          <p>${termoBusca ? 'Nenhuma regra encontrada para a pesquisa.' : 'Nenhuma regra configurada ainda.'}</p>
          <p style="margin-top: 16px;">${termoBusca ? 'Tente outro termo de busca.' : 'Clique em "Nova Regra" para começar.'}</p>
        </div>
      `;
      return;
    }
    
    lista.innerHTML = '';
    
    regrasFiltradas.forEach(regra => {
      const card = criarCardRegra(regra);
      lista.appendChild(card);
    });
    
    // Atualiza contador de regras ativas
    const regrasAtivas = regras.filter(r => r.ativa).length;
    document.getElementById('stat-regras').textContent = regrasAtivas;
    
    // Atualiza seleção
    atualizarSelecao();
    
  } catch (error) {
    console.error('Erro ao carregar regras:', error);
    lista.innerHTML = `
      <div class="vazio">
        <p style="color: #d93025;">Erro ao carregar regras: ${error.message}</p>
      </div>
    `;
  }
}

/**
 * Cria card de regra
 */
function criarCardRegra(regra) {
  const card = document.createElement('div');
  card.className = 'regra-linha';
  card.setAttribute('data-regra-id', regra.id);
  const isSelecionada = regrasSelecionadas.has(regra.id);
  
  const condicoes = [];
  if (regra.condicoes?.remetente?.length > 0) {
    condicoes.push(`Remetente: ${regra.condicoes.remetente.join(', ')}`);
  }
  if (regra.condicoes?.assunto?.length > 0) {
    condicoes.push(`Assunto: ${regra.condicoes.assunto.join(', ')}`);
  }
  
  const acoes = [];
  if (regra.acoes?.label) {
    acoes.push(`Label: ${regra.acoes.label}`);
  }
  if (regra.acoes?.marcarLido) {
    acoes.push('Marcar como lido');
  }
  if (regra.acoes?.arquivar) {
    acoes.push('Arquivar');
  }
  if (regra.acoes?.retencaoDias) {
    acoes.push(`Excluir após ${regra.acoes.retencaoDias} dias`);
  }
  
  card.innerHTML = `
    <div class="regra-linha-checkbox">
      <input 
        type="checkbox" 
        class="regra-checkbox" 
        data-regra-id="${regra.id}"
        ${isSelecionada ? 'checked' : ''}
      >
    </div>
    <div class="regra-linha-nome">
      <span class="regra-nome">${regra.nome}</span>
      <span class="regra-status ${regra.ativa ? 'ativa' : 'inativa'}">
        ${regra.ativa ? 'Ativa' : 'Inativa'}
      </span>
      <span class="regra-exec-status hidden" data-status=""></span>
    </div>
    <div class="regra-linha-condicoes">
      ${condicoes.length > 0 ? condicoes.join(', ') : '-'}
    </div>
    <div class="regra-linha-acoes">
      ${acoes.length > 0 ? acoes.join(', ') : '-'}
    </div>
    <div class="regra-linha-botoes">
      <button class="btn-secondary btn-sm btn-editar" data-id="${regra.id}" title="Editar">✏️</button>
      <button class="btn-secondary btn-sm btn-toggle" data-id="${regra.id}" data-ativa="${regra.ativa}" title="${regra.ativa ? 'Desativar' : 'Ativar'}">
        ${regra.ativa ? '⏸️' : '▶️'}
      </button>
      <button class="btn-danger btn-sm btn-excluir" data-id="${regra.id}" title="Excluir">🗑️</button>
    </div>
  `;
  
  // Event listener para checkbox
  const checkbox = card.querySelector('.regra-checkbox');
  if (checkbox) {
    checkbox.addEventListener('change', (e) => {
      const regraId = e.target.getAttribute('data-regra-id');
      if (e.target.checked) {
        regrasSelecionadas.add(regraId);
      } else {
        regrasSelecionadas.delete(regraId);
      }
      atualizarSelecao();
    });
  }
  
  // Atualiza checkbox do cabeçalho quando uma regra é selecionada/deselecionada
  atualizarCheckboxHeader();
  
  // Event listeners
  card.querySelector('.btn-editar').addEventListener('click', () => {
    editarRegra(regra);
  });
  
  card.querySelector('.btn-toggle').addEventListener('click', async () => {
    await toggleRegraStatus(regra.id, !regra.ativa);
  });
  
  card.querySelector('.btn-excluir').addEventListener('click', async () => {
    if (confirm(`Tem certeza que deseja excluir a regra "${regra.nome}"?`)) {
      await excluirRegra(regra.id);
    }
  });
  
  return card;
}

/**
 * Abre modal para criar nova regra
 */
function abrirModalRegra(regra = null) {
  regraEditando = regra;
  const modal = document.getElementById('modal-regra');
  const titulo = document.getElementById('modal-titulo');
  const form = document.getElementById('form-regra');
  
  if (regra) {
    titulo.textContent = 'Editar Regra';
    preencherFormulario(regra);
  } else {
    titulo.textContent = 'Nova Regra';
    form.reset();
    document.getElementById('regra-ativa').checked = true;
  }
  
  modal.classList.remove('hidden');
}

/**
 * Fecha modal
 */
function fecharModalRegra() {
  const modal = document.getElementById('modal-regra');
  modal.classList.add('hidden');
  regraEditando = null;
  document.getElementById('form-regra').reset();
}

/**
 * Preenche formulário com dados da regra
 */
function preencherFormulario(regra) {
  document.getElementById('regra-nome').value = regra.nome || '';
  document.getElementById('regra-remetente').value = regra.condicoes?.remetente?.join(', ') || '';
  document.getElementById('regra-assunto').value = regra.condicoes?.assunto?.join(', ') || '';
  document.getElementById('regra-label').value = regra.acoes?.label || '';
  document.getElementById('regra-marcar-lido').checked = regra.acoes?.marcarLido || false;
  document.getElementById('regra-arquivar').checked = regra.acoes?.arquivar || false;
  document.getElementById('regra-retencao').value = regra.acoes?.retencaoDias || '';
  document.getElementById('regra-ativa').checked = regra.ativa !== false;
}

/**
 * Salva regra do formulário
 */
async function salvarRegraForm() {
  const nome = document.getElementById('regra-nome').value.trim();
  if (!nome) {
    alert('Por favor, informe o nome da regra.');
    return;
  }
  
  const remetente = document.getElementById('regra-remetente').value
    .split(',')
    .map(s => s.trim())
    .filter(s => s);
  
  const assunto = document.getElementById('regra-assunto').value
    .split(',')
    .map(s => s.trim())
    .filter(s => s);
  
  const label = document.getElementById('regra-label').value.trim();
  const marcarLido = document.getElementById('regra-marcar-lido').checked;
  const arquivar = document.getElementById('regra-arquivar').checked;
  const retencao = parseInt(document.getElementById('regra-retencao').value) || 0;
  const ativa = document.getElementById('regra-ativa').checked;
  
  const regra = {
    id: regraEditando?.id,
    nome,
    condicoes: {
      remetente: remetente.length > 0 ? remetente : undefined,
      assunto: assunto.length > 0 ? assunto : undefined
    },
    acoes: {
      label: label || undefined,
      marcarLido,
      arquivar,
      retencaoDias: retencao > 0 ? retencao : undefined
    },
    ativa
  };
  
  try {
    await salvarRegra(regra);
    fecharModalRegra();
    regrasSelecionadas.clear();
    await carregarRegras(document.getElementById('regras-search')?.value || '');
    atualizarSelecao();
    alert('Regra salva com sucesso!');
  } catch (error) {
    console.error('Erro ao salvar regra:', error);
    alert('Erro ao salvar regra: ' + error.message);
  }
}

/**
 * Edita regra
 */
function editarRegra(regra) {
  abrirModalRegra(regra);
}

/**
 * Alterna status da regra
 */
async function toggleRegraStatus(regraId, ativa) {
  try {
    await toggleRegra(regraId, ativa);
    await carregarRegras();
  } catch (error) {
    console.error('Erro ao alterar status:', error);
    alert('Erro ao alterar status: ' + error.message);
  }
}

/**
 * Exclui regra
 */
async function excluirRegra(regraId) {
  try {
    await removerRegra(regraId);
    await carregarRegras();
  } catch (error) {
    console.error('Erro ao excluir regra:', error);
    alert('Erro ao excluir regra: ' + error.message);
  }
}

/**
 * Carrega e exibe estatísticas
 */
async function carregarEstatisticas() {
  try {
    const stats = await obterEstatisticas();
    
    // Carrega estatísticas salvas do storage
    const statProcessados = document.getElementById('stat-processados');
    const statExcluidos = document.getElementById('stat-excluidos');
    const statRegras = document.getElementById('stat-regras');
    
    if (statProcessados) {
      statProcessados.textContent = stats.emailsProcessados || 0;
    }
    
    if (statExcluidos) {
      statExcluidos.textContent = stats.emailsExcluidos || 0;
    }
    
    // Atualiza contador de regras ativas (calculado dinamicamente)
    if (statRegras) {
      const regras = await obterRegras();
      const regrasAtivas = regras.filter(r => r.ativa).length;
      statRegras.textContent = regrasAtivas;
    }
    
    console.log('[EmailZen] Estatísticas carregadas:', {
      processados: stats.emailsProcessados || 0,
      excluidos: stats.emailsExcluidos || 0
    });
  } catch (error) {
    console.error('Erro ao carregar estatísticas:', error);
    // Em caso de erro, define valores padrão
    const statProcessados = document.getElementById('stat-processados');
    const statExcluidos = document.getElementById('stat-excluidos');
    if (statProcessados) statProcessados.textContent = '0';
    if (statExcluidos) statExcluidos.textContent = '0';
  }
}

/**
 * Verifica se o service worker está ativo
 */
async function verificarServiceWorker() {
  try {
    const response = await enviarMensagemComRetry({ acao: 'ping' }, 1);
    return response && response.pong === true;
  } catch (error) {
    return false;
  }
}

/**
 * Envia mensagem ao service worker com retry e tratamento de erros
 */
async function enviarMensagemComRetry(mensagem, maxTentativas = 2) {
  let tentativas = 0;
  let ultimoErro = null;
  
  while (tentativas < maxTentativas) {
    try {
      // Verifica se há erro do Chrome runtime
      if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
      }
      
      // Cria uma promise com timeout maior (processamento pode demorar)
      const messagePromise = chrome.runtime.sendMessage(mensagem);
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: Service worker não respondeu em 60 segundos. O processamento pode estar demorando muito.')), 60000)
      );
      
      const response = await Promise.race([messagePromise, timeoutPromise]);
      
      // Verifica se a resposta foi recebida
      if (!response) {
        throw new Error('Nenhuma resposta do service worker');
      }
      
      return response;
      
    } catch (error) {
      tentativas++;
      ultimoErro = error;
      console.error(`[Tentativa ${tentativas}/${maxTentativas}] Erro ao enviar mensagem:`, error);
      
      // Se é erro de runtime do Chrome, tenta aguardar e tentar novamente
      if (error.message.includes('Extension context invalidated') || 
          error.message.includes('message port closed') ||
          error.message.includes('Could not establish connection')) {
        
        // Tenta aguardar um pouco e tentar novamente
        if (tentativas < maxTentativas) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
      }
      
      // Se esgotou as tentativas
      if (tentativas >= maxTentativas) {
        throw ultimoErro;
      }
    }
  }
  
  throw ultimoErro || new Error('Erro desconhecido ao enviar mensagem');
}

/**
 * Executa todas as regras ativas
 */
async function executarRegras() {
  const btnExecutar = document.getElementById('btn-executar-regras');
  const regras = await obterRegras();
  const regrasAtivas = regras.filter(r => r.ativa);
  
  if (regrasAtivas.length === 0) {
    alert('Nenhuma regra ativa para executar.');
    return;
  }
  
  // Verifica se o service worker está ativo
  const swAtivo = await verificarServiceWorker();
  if (!swAtivo) {
    alert('Service worker não está ativo. Por favor, recarregue a extensão em chrome://extensions/ e tente novamente.');
    return;
  }
  
  // Desabilita botão
  btnExecutar.disabled = true;
  btnExecutar.innerHTML = '<span class="btn-icon">⏳</span> Executando...';
  
  // Limpa status anteriores
  document.querySelectorAll('.regra-exec-status').forEach(el => {
    el.classList.add('hidden');
    el.textContent = '';
    el.setAttribute('data-status', '');
  });
  
  try {
    // Executa cada regra individualmente
    for (let i = 0; i < regrasAtivas.length; i++) {
      const regra = regrasAtivas[i];
      const card = document.querySelector(`[data-regra-id="${regra.id}"]`);
      let statusEl = null;
      
      if (card) {
        statusEl = card.querySelector('.regra-exec-status');
        if (statusEl) {
          statusEl.classList.remove('hidden');
          statusEl.classList.add('executando');
          statusEl.setAttribute('data-status', 'executando');
          statusEl.innerHTML = '⏳ Executando...';
        }
      }
      
      // Executa a regra usando função auxiliar com retry
      let response;
      try {
        response = await enviarMensagemComRetry({
          acao: 'executarRegra',
          regraId: regra.id
        });
      } catch (error) {
        console.error(`Erro ao executar regra ${regra.id}:`, error);
        if (card && statusEl) {
          statusEl.classList.remove('executando');
          statusEl.classList.add('erro');
          statusEl.setAttribute('data-status', 'erro');
          
          let mensagemErro = error.message || 'Erro desconhecido';
          if (mensagemErro.includes('Timeout')) {
            mensagemErro = 'Timeout: Service worker não respondeu. Tente recarregar a extensão.';
          } else if (mensagemErro.includes('Extension context') || mensagemErro.includes('message port')) {
            mensagemErro = 'Service worker inativo. Recarregue a extensão em chrome://extensions/';
          }
          
          statusEl.innerHTML = `❌ Erro: ${mensagemErro}`;
        }
        continue; // Pula para próxima regra
      }
      
      if (card && statusEl) {
        if (response && response.sucesso) {
          statusEl.classList.remove('executando');
          statusEl.classList.add('concluida');
          statusEl.setAttribute('data-status', 'concluida');
          statusEl.innerHTML = `✅ Concluída (${response.processados || 0} emails)`;
        } else {
          statusEl.classList.remove('executando');
          statusEl.classList.add('erro');
          statusEl.setAttribute('data-status', 'erro');
          statusEl.innerHTML = `❌ Erro: ${response?.erro || 'Erro desconhecido'}`;
        }
      }
      
      // Pequeno delay para visualização
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Atualiza estatísticas
    await carregarEstatisticas();
    
    // Conta quantas regras foram executadas com sucesso
    const regrasComSucesso = document.querySelectorAll('.regra-exec-status.concluida').length;
    const regrasComErro = document.querySelectorAll('.regra-exec-status.erro').length;
    
    // Mostra mensagem de conclusão
    let mensagem = `Execução concluída!\n\n`;
    mensagem += `✅ ${regrasComSucesso} regra(s) executada(s) com sucesso\n`;
    if (regrasComErro > 0) {
      mensagem += `❌ ${regrasComErro} regra(s) com erro\n`;
      mensagem += `\nSe houver erros de "Service worker não respondeu", recarregue a extensão em chrome://extensions/`;
    }
    alert(mensagem);
    
  } catch (error) {
    console.error('Erro ao executar regras:', error);
    let mensagemErro = error.message || 'Erro desconhecido';
    if (mensagemErro.includes('Extension context') || mensagemErro.includes('message port')) {
      mensagemErro = 'Service worker inativo. Por favor, recarregue a extensão em chrome://extensions/';
    }
    alert('Erro ao executar regras: ' + mensagemErro);
  } finally {
    // Reabilita botão
    btnExecutar.disabled = false;
    btnExecutar.innerHTML = '<span class="btn-icon">▶️</span> Executar Regras';
  }
}

/**
 * Atualiza interface de seleção
 */
function atualizarSelecao() {
  const selecaoDiv = document.getElementById('regras-selecao');
  const contador = document.getElementById('selecao-contador');
  
  if (regrasSelecionadas.size > 0) {
    selecaoDiv?.classList.remove('hidden');
    contador.textContent = regrasSelecionadas.size;
  } else {
    selecaoDiv?.classList.add('hidden');
  }
  
  atualizarCheckboxHeader();
}

/**
 * Atualiza estado do checkbox do cabeçalho
 */
function atualizarCheckboxHeader() {
  const checkboxHeader = document.getElementById('checkbox-selecionar-todas');
  if (!checkboxHeader) return;
  
  const checkboxesRegras = document.querySelectorAll('.regra-checkbox[data-regra-id]');
  const totalRegras = checkboxesRegras.length;
  const selecionadas = Array.from(checkboxesRegras).filter(cb => cb.checked).length;
  
  if (totalRegras === 0) {
    checkboxHeader.checked = false;
    checkboxHeader.indeterminate = false;
  } else if (selecionadas === totalRegras) {
    checkboxHeader.checked = true;
    checkboxHeader.indeterminate = false;
  } else if (selecionadas > 0) {
    checkboxHeader.checked = false;
    checkboxHeader.indeterminate = true;
  } else {
    checkboxHeader.checked = false;
    checkboxHeader.indeterminate = false;
  }
}

/**
 * Seleciona todas as regras visíveis
 */
function selecionarTodasRegras() {
  const checkboxHeader = document.getElementById('checkbox-selecionar-todas');
  document.querySelectorAll('.regra-checkbox[data-regra-id]').forEach(checkbox => {
    const regraId = checkbox.getAttribute('data-regra-id');
    if (regraId) {
      checkbox.checked = true;
      regrasSelecionadas.add(regraId);
    }
  });
  if (checkboxHeader) {
    checkboxHeader.checked = true;
  }
  atualizarSelecao();
}

/**
 * Deseleciona todas as regras
 */
function deselecionarTodasRegras() {
  const checkboxHeader = document.getElementById('checkbox-selecionar-todas');
  document.querySelectorAll('.regra-checkbox[data-regra-id]').forEach(checkbox => {
    checkbox.checked = false;
  });
  regrasSelecionadas.clear();
  if (checkboxHeader) {
    checkboxHeader.checked = false;
  }
  atualizarSelecao();
}

/**
 * Executa regras selecionadas
 */
async function executarRegrasSelecionadas() {
  if (regrasSelecionadas.size === 0) {
    alert('Nenhuma regra selecionada.');
    return;
  }
  
  // Verifica se o service worker está ativo
  const swAtivo = await verificarServiceWorker();
  if (!swAtivo) {
    alert('Service worker não está ativo. Por favor, recarregue a extensão em chrome://extensions/ e tente novamente.');
    return;
  }
  
  const regrasIds = Array.from(regrasSelecionadas);
  const regras = todasRegras.filter(r => regrasIds.includes(r.id) && r.ativa);
  
  if (regras.length === 0) {
    alert('Nenhuma regra ativa selecionada.');
    return;
  }
  
  // Executa cada regra selecionada
  for (const regra of regras) {
    const card = document.querySelector(`[data-regra-id="${regra.id}"]`);
    let statusEl = card?.querySelector('.regra-exec-status');
    
    if (statusEl) {
      statusEl.classList.remove('hidden');
      statusEl.classList.add('executando');
      statusEl.innerHTML = '⏳ Executando...';
    }
    
    try {
      const response = await enviarMensagemComRetry({
        acao: 'executarRegra',
        regraId: regra.id
      });
      
      if (statusEl) {
        if (response && response.sucesso) {
          statusEl.classList.remove('executando');
          statusEl.classList.add('concluida');
          statusEl.innerHTML = `✅ Concluída (${response.processados || 0} emails)`;
        } else {
          statusEl.classList.remove('executando');
          statusEl.classList.add('erro');
          statusEl.innerHTML = `❌ Erro: ${response?.erro || 'Erro desconhecido'}`;
        }
      }
    } catch (error) {
      if (statusEl) {
        statusEl.classList.remove('executando');
        statusEl.classList.add('erro');
        
        let mensagemErro = error.message || 'Erro desconhecido';
        if (mensagemErro.includes('Timeout')) {
          mensagemErro = 'Timeout: Service worker não respondeu';
        } else if (mensagemErro.includes('Extension context') || mensagemErro.includes('message port')) {
          mensagemErro = 'Service worker inativo. Recarregue a extensão.';
        }
        
        statusEl.innerHTML = `❌ Erro: ${mensagemErro}`;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  await carregarEstatisticas();
  alert(`Execução concluída! ${regras.length} regra(s) processada(s).`);
}

/**
 * Desativa regras selecionadas
 */
async function desativarRegrasSelecionadas() {
  if (regrasSelecionadas.size === 0) {
    alert('Nenhuma regra selecionada.');
    return;
  }
  
  if (!confirm(`Deseja desativar ${regrasSelecionadas.size} regra(s)?`)) {
    return;
  }
  
  for (const regraId of regrasSelecionadas) {
    await toggleRegra(regraId, false);
  }
  
  regrasSelecionadas.clear();
  await carregarRegras(document.getElementById('regras-search')?.value || '');
  atualizarSelecao();
}

/**
 * Exclui regras selecionadas
 */
async function excluirRegrasSelecionadas() {
  if (regrasSelecionadas.size === 0) {
    alert('Nenhuma regra selecionada.');
    return;
  }
  
  if (!confirm(`Deseja excluir ${regrasSelecionadas.size} regra(s)? Esta ação não pode ser desfeita.`)) {
    return;
  }
  
  for (const regraId of regrasSelecionadas) {
    await removerRegra(regraId);
  }
  
  regrasSelecionadas.clear();
  await carregarRegras(document.getElementById('regras-search')?.value || '');
  atualizarSelecao();
}

/**
 * Carrega configurações de verificação automática
 */
async function carregarConfigVerificacao() {
  const config = await obterConfigVerificacao();
  
  const checkboxAtiva = document.getElementById('config-verificacao-ativa');
  const inputIntervalo = document.getElementById('config-intervalo');
  
  if (checkboxAtiva) {
    checkboxAtiva.checked = config.ativa;
  }
  
  if (inputIntervalo) {
    inputIntervalo.value = config.intervaloMinutos;
  }
  
  await atualizarStatusVerificacao();
  
  // Atualiza status a cada minuto
  setInterval(atualizarStatusVerificacao, 60000);
}

/**
 * Atualiza status da verificação automática
 */
async function atualizarStatusVerificacao() {
  const statusText = document.getElementById('config-status-text');
  const proximaVerificacao = document.getElementById('config-proxima-verificacao');
  
  if (!statusText || !proximaVerificacao) return;
  
  try {
    // Verifica se há alarme configurado
    const alarme = await chrome.alarms.get('processarEmails');
    const config = await obterConfigVerificacao();
    
    if (alarme && config.ativa) {
      statusText.textContent = 'Ativa';
      statusText.className = 'status-value status-ativa';
      
      // Calcula próxima verificação
      const agora = Date.now();
      const proxima = alarme.scheduledTime;
      const minutosRestantes = Math.ceil((proxima - agora) / 1000 / 60);
      
      if (minutosRestantes <= 0) {
        proximaVerificacao.textContent = 'Em breve...';
      } else if (minutosRestantes === 1) {
        proximaVerificacao.textContent = 'Em 1 minuto';
      } else {
        proximaVerificacao.textContent = `Em ${minutosRestantes} minutos`;
      }
    } else {
      statusText.textContent = 'Inativa';
      statusText.className = 'status-value status-inativa';
      proximaVerificacao.textContent = '-';
    }
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    statusText.textContent = 'Erro ao verificar';
    proximaVerificacao.textContent = '-';
  }
}

/**
 * Salva configurações de verificação automática
 */
async function salvarConfigVerificacaoForm() {
  const checkboxAtiva = document.getElementById('config-verificacao-ativa');
  const inputIntervalo = document.getElementById('config-intervalo');
  const btnSalvar = document.getElementById('btn-salvar-config');
  
  if (!checkboxAtiva || !inputIntervalo || !btnSalvar) return;
  
  const ativa = checkboxAtiva.checked;
  const intervaloMinutos = parseInt(inputIntervalo.value, 10);
  
  // Validação
  if (isNaN(intervaloMinutos) || intervaloMinutos < 1 || intervaloMinutos > 1440) {
    alert('Por favor, insira um intervalo válido entre 1 e 1440 minutos.');
    return;
  }
  
  // Desabilita botão durante salvamento
  btnSalvar.disabled = true;
  btnSalvar.innerHTML = '<span class="btn-icon">⏳</span> Salvando...';
  
  try {
    // Salva configuração
    await salvarConfigVerificacao({
      ativa,
      intervaloMinutos
    });
    
    // Envia mensagem para service worker atualizar o alarme
    try {
      await enviarMensagemComRetry({
        acao: 'atualizarAlarmeVerificacao',
        ativa,
        intervaloMinutos
      });
      
      await atualizarStatusVerificacao();
      
      alert('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar alarme:', error);
      alert('Configurações salvas, mas houve um erro ao atualizar o alarme. Recarregue a extensão.');
    }
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    alert('Erro ao salvar configurações: ' + error.message);
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.innerHTML = '<span class="btn-icon">💾</span> Salvar Configurações';
  }
}

// Inicializa quando página carrega
document.addEventListener('DOMContentLoaded', inicializar);

