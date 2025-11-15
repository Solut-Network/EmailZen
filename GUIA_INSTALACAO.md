# 🚀 Guia Rápido de Instalação - EmailZen

## ⚠️ IMPORTANTE: Antes de Instalar

A extensão precisa de **credenciais OAuth do Google** para funcionar. Você tem duas opções:

### Opção 1: Configurar OAuth (Recomendado para uso real)
1. Siga as instruções no `README.md` para obter Client ID OAuth
2. Edite `manifest.json` e substitua `SEU_CLIENT_ID_AQUI.apps.googleusercontent.com` pelo seu Client ID

### Opção 2: Testar sem OAuth (Apenas interface)
- A extensão carregará, mas a autenticação não funcionará
- Você pode testar a interface e estrutura, mas não processará emails reais

---

## 📦 Instalação Passo a Passo

### Passo 1: Abrir Página de Extensões do Chrome

1. Abra o Google Chrome
2. Digite na barra de endereços: `chrome://extensions/`
3. Ou vá em: Menu (⋮) > Mais ferramentas > Extensões

### Passo 2: Ativar Modo Desenvolvedor

1. No canto superior direito da página de extensões
2. Ative o toggle **"Modo do desenvolvedor"** (Developer mode)
3. Você verá novos botões aparecerem

### Passo 3: Carregar a Extensão

1. Clique no botão **"Carregar sem compactação"** (Load unpacked)
2. Navegue até a pasta do projeto: `C:\projetos\Organizador Emails`
3. Selecione a pasta e clique em **"Selecionar pasta"** (Select Folder)

### Passo 4: Verificar Instalação

Você deve ver:
- ✅ A extensão **EmailZen** aparecer na lista
- ✅ Um ícone de email na barra de ferramentas do Chrome
- ✅ Status "Ativada" (Enabled)

---

## 🧪 Como Testar

### Teste 1: Verificar Popup
1. Clique no ícone da extensão na barra de ferramentas
2. Você deve ver o popup com:
   - Título "EmailZen"
   - Status de autenticação
   - Botões de ação

### Teste 2: Abrir Página de Opções
1. Clique com botão direito no ícone da extensão
2. Selecione **"Opções"** (Options)
3. Ou clique no botão "Abrir Configurações" no popup
4. Você deve ver a página de configurações com:
   - Seção de regras
   - Botão "Nova Regra"
   - Estatísticas

### Teste 3: Testar no Gmail
1. Abra o Gmail: https://mail.google.com
2. Aguarde alguns segundos para a extensão carregar
3. Você deve ver:
   - Botão flutuante no canto inferior direito
   - Ao clicar, abre o painel lateral

### Teste 4: Criar uma Regra de Teste
1. Na página de opções, clique em **"Nova Regra"**
2. Preencha:
   - Nome: "Teste"
   - Remetente: `@teste.com`
   - Label: "Teste"
3. Clique em **"Salvar Regra"**
4. A regra deve aparecer na lista

---

## 🔧 Solução de Problemas

### Extensão não aparece
- Verifique se o modo desenvolvedor está ativado
- Recarregue a página de extensões (F5)
- Verifique se selecionou a pasta correta

### Erro ao carregar
- Abra o console (F12) e verifique erros
- Verifique se todos os arquivos estão presentes
- Veja a seção de erros na página de extensões

### Painel não aparece no Gmail
- Recarregue a página do Gmail (F5)
- Verifique o console do navegador (F12) para erros
- Certifique-se de estar logado no Gmail

### Autenticação não funciona
- Verifique se configurou o Client ID no `manifest.json`
- Veja instruções completas no `README.md`

---

## 📝 Notas Importantes

1. **Modo Desenvolvedor**: A extensão só funciona enquanto o modo desenvolvedor estiver ativo
2. **Atualizações**: Após fazer alterações no código, clique no botão de recarregar (↻) na página de extensões
3. **Logs**: Para ver logs do service worker:
   - Vá em `chrome://extensions/`
   - Clique em "Detalhes" na extensão
   - Clique em "Inspecionar visualizações" > "service-worker"
   - Abre o console do service worker

---

## ✅ Checklist de Teste

- [ ] Extensão carrega sem erros
- [ ] Popup abre corretamente
- [ ] Página de opções abre
- [ ] Botão flutuante aparece no Gmail
- [ ] Painel lateral abre no Gmail
- [ ] É possível criar uma regra
- [ ] Regras aparecem na lista
- [ ] Interface está em português

---

**Pronto!** Agora você pode testar a extensão EmailZen! 🎉

