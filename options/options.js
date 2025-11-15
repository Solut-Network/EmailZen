/**
 * Options Page Script - Gerenciamento de regras
 */

import { obterRegras, salvarRegra, removerRegra, toggleRegra, obterEstatisticas } from '../utils/storage.js';

let regraEditando = null;

/**
 * Inicializa a página
 */
async function inicializar() {
  await carregarRegras();
  await carregarEstatisticas();
  
  // Event listeners
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
}

/**
 * Carrega e exibe regras
 */
async function carregarRegras() {
  const lista = document.getElementById('regras-lista');
  lista.innerHTML = '<div class="loading">Carregando regras...</div>';
  
  try {
    const regras = await obterRegras();
    
    if (regras.length === 0) {
      lista.innerHTML = `
        <div class="vazio">
          <p>Nenhuma regra configurada ainda.</p>
          <p style="margin-top: 16px;">Clique em "Nova Regra" para começar.</p>
        </div>
      `;
      return;
    }
    
    lista.innerHTML = '';
    
    regras.forEach(regra => {
      const card = criarCardRegra(regra);
      lista.appendChild(card);
    });
    
    // Atualiza contador de regras ativas
    const regrasAtivas = regras.filter(r => r.ativa).length;
    document.getElementById('stat-regras').textContent = regrasAtivas;
    
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
  card.className = 'regra-card';
  
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
    <div class="regra-card-header">
      <div>
        <span class="regra-nome">${regra.nome}</span>
        <span class="regra-status ${regra.ativa ? 'ativa' : 'inativa'}">
          ${regra.ativa ? 'Ativa' : 'Inativa'}
        </span>
      </div>
    </div>
    <div class="regra-detalhes">
      ${condicoes.length > 0 ? `
        <div class="regra-detalhe">
          <strong>Condições:</strong><br>
          ${condicoes.join('<br>')}
        </div>
      ` : ''}
      ${acoes.length > 0 ? `
        <div class="regra-detalhe">
          <strong>Ações:</strong><br>
          ${acoes.join('<br>')}
        </div>
      ` : ''}
    </div>
    <div class="regra-acoes">
      <button class="btn-secondary btn-editar" data-id="${regra.id}">Editar</button>
      <button class="btn-secondary btn-toggle" data-id="${regra.id}" data-ativa="${regra.ativa}">
        ${regra.ativa ? 'Desativar' : 'Ativar'}
      </button>
      <button class="btn-danger btn-excluir" data-id="${regra.id}">Excluir</button>
    </div>
  `;
  
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
    await carregarRegras();
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
    document.getElementById('stat-processados').textContent = stats.emailsProcessados || 0;
    document.getElementById('stat-excluidos').textContent = stats.emailsExcluidos || 0;
  } catch (error) {
    console.error('Erro ao carregar estatísticas:', error);
  }
}

// Inicializa quando página carrega
document.addEventListener('DOMContentLoaded', inicializar);

