# ⚡ Teste Rápido - EmailZen

## 🎯 Instalação em 3 Passos

### 1️⃣ Abrir Extensões do Chrome
```
Digite na barra de endereços: chrome://extensions/
```

### 2️⃣ Ativar Modo Desenvolvedor
- No canto superior direito, ative o toggle **"Modo do desenvolvedor"**

### 3️⃣ Carregar Extensão
- Clique em **"Carregar sem compactação"**
- Selecione a pasta: `C:\projetos\Organizador Emails`
- Pronto! ✅

---

## 🧪 Testes Básicos

### ✅ Verificar Instalação
- Ícone aparece na barra de ferramentas?
- Status mostra "Ativada"?

### ✅ Testar Popup
- Clique no ícone
- Deve abrir popup com "EmailZen"

### ✅ Testar Opções
- Clique direito no ícone > "Opções"
- Ou no popup: "Abrir Configurações"
- Deve abrir página de configurações

### ✅ Testar no Gmail
1. Abra: https://mail.google.com
2. Aguarde 2-3 segundos
3. Deve aparecer botão flutuante (canto inferior direito)
4. Clique no botão
5. Painel lateral deve abrir

---

## ⚠️ Importante sobre OAuth

**Para testar funcionalidades completas:**
- Configure Client ID OAuth no `manifest.json`
- Veja instruções no `README.md`

**Para testar apenas interface:**
- Pode carregar sem OAuth
- Interface funcionará, mas autenticação não

---

## 🔄 Atualizar após Mudanças

Após editar código:
1. Vá em `chrome://extensions/`
2. Clique no botão de **recarregar** (↻) na extensão
3. Ou recarregue a página do Gmail (F5)

---

## 🐛 Ver Erros

**Console do Navegador:**
- Pressione F12 no Gmail
- Veja aba "Console"

**Service Worker:**
- `chrome://extensions/` > Detalhes > "Inspecionar visualizações" > service-worker

---

**Pronto para testar!** 🚀

