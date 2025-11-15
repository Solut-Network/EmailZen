# 📸 Como Adicionar Screenshots ao Git

Este guia explica como adicionar screenshots do EmailZen ao repositório Git para documentação.

## ✅ Estrutura Criada

```
EmailZen/
├── docs/
│   ├── README.md                    # Documentação geral
│   ├── COMO_ADICIONAR_SCREENSHOTS.md # Este arquivo
│   └── screenshots/                  # Pasta para screenshots
│       ├── README.md                 # Instruções sobre screenshots
│       └── (suas imagens aqui)       # Screenshots do app
```

## 📋 Passo a Passo

### 1. Tire os Screenshots

Tire screenshots das principais telas:
- ✅ Popup autenticado
- ✅ Popup com sugestões inteligentes
- ✅ Página de configurações
- ✅ Lista de regras
- ✅ Modal de criar regra
- ✅ Estatísticas

### 2. Salve na Pasta Correta

Salve os arquivos em: `docs/screenshots/`

**Nomes sugeridos:**
- `popup-autenticado.png`
- `popup-sugestoes.png`
- `popup-nao-autenticado.png`
- `configuracoes-regras.png`
- `configuracoes-estatisticas.png`
- `modal-nova-regra.png`

### 3. Adicione ao Git

```bash
# Adicionar screenshots
git add docs/screenshots/*.png

# Verificar o que será commitado
git status

# Fazer commit
git commit -m "docs: adiciona screenshots do app"

# Enviar para o repositório
git push
```

## 📝 Atualizar README.md

Após adicionar os screenshots, atualize o `README.md` principal:

```markdown
## 📸 Screenshots

### Popup da Extensão
![Popup Autenticado](docs/screenshots/popup-autenticado.png)
*Interface principal do popup com sugestões inteligentes*

### Página de Configurações
![Configurações](docs/screenshots/configuracoes-regras.png)
*Gerenciamento de regras de filtro e estatísticas*
```

## ⚠️ Importante

- ✅ Screenshots em `docs/screenshots/` **SERÃO commitados** no Git
- ❌ Logos em `logos/` **NÃO serão commitadas** (privadas)
- ✅ Use formato PNG para melhor qualidade
- ✅ Use nomes descritivos e consistentes

## 🎯 Exemplo Completo

1. Tire screenshot do popup
2. Salve como `docs/screenshots/popup-autenticado.png`
3. Execute:
   ```bash
   git add docs/screenshots/popup-autenticado.png
   git commit -m "docs: adiciona screenshot do popup autenticado"
   git push
   ```
4. Atualize o README.md com a referência à imagem

## 📚 Mais Informações

Veja [`docs/screenshots/README.md`](screenshots/README.md) para mais detalhes.

