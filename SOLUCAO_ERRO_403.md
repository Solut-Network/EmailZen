# 🔧 Solução para Erro 403 - Acesso Negado à Gmail API

## ❌ Erro
```
Erro na API: 403 Forbidden
```

## 🔍 Causas Possíveis

O erro 403 significa que a Gmail API está negando o acesso. Isso pode acontecer por:

1. **Gmail API não está ativada** no Google Cloud Console
2. **Escopos não configurados** na tela de consentimento OAuth
3. **Token sem permissões** - precisa reautenticar
4. **Tela de consentimento em modo de teste** sem usuário de teste

## ✅ Solução Passo a Passo

### Passo 1: Verificar se Gmail API está Ativada

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Selecione seu projeto
3. Vá em **"APIs e Serviços"** > **"Biblioteca"**
4. Procure por **"Gmail API"**
5. Se não estiver ativada, clique em **"Ativar"**
6. Aguarde alguns segundos

### Passo 2: Verificar Tela de Consentimento OAuth

1. No Google Cloud Console, vá em **"APIs e Serviços"** > **"Tela de consentimento OAuth"**
2. Verifique se os escopos estão adicionados:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.labels`
   - `https://www.googleapis.com/auth/gmail.readonly`
3. Se não estiverem, adicione-os:
   - Clique em **"Escopos"**
   - Clique em **"Adicionar ou remover escopos"**
   - Procure por "Gmail" e adicione os 3 escopos acima
   - Salve

### Passo 3: Verificar Usuários de Teste

1. Na tela de consentimento OAuth, vá em **"Público-alvo"** ou **"Usuários de teste"**
2. Se estiver em modo "Testando", adicione seu email:
   - Clique em **"+ Adicionar usuários"**
   - Adicione seu email do Gmail
   - Salve

### Passo 4: Reautenticar na Extensão

1. Abra o popup da extensão EmailZen
2. Se estiver autenticado, faça logout primeiro
3. Clique em **"Autenticar com Google"**
4. **IMPORTANTE**: Na janela de autorização do Google, certifique-se de autorizar TODOS os escopos solicitados
5. Aguarde a confirmação

### Passo 5: Revogar Permissões Antigas (se necessário)

Se ainda não funcionar, revogue as permissões antigas:

1. Acesse: https://myaccount.google.com/permissions
2. Encontre "EmailZen" ou seu projeto
3. Clique em **"Remover acesso"**
4. Tente autenticar novamente na extensão

## 🧪 Teste

Após seguir os passos acima:

1. Recarregue a extensão em `chrome://extensions/`
2. Abra o popup e autentique novamente
3. Tente usar a funcionalidade "Analisar Inbox"
4. Verifique o console do Service Worker para ver se o erro persiste

## 📝 Verificar Logs

Para ver logs detalhados:

1. Abra `chrome://extensions/`
2. Encontre "EmailZen"
3. Clique em **"Detalhes"**
4. Clique em **"Inspecionar visualizações"** > **"service-worker"**
5. Veja o console para mensagens de erro detalhadas

## ⚠️ Importante

- O erro 403 geralmente é resolvido reautenticando após configurar corretamente a Gmail API e os escopos
- Pode levar alguns minutos para as mudanças no Google Cloud Console entrarem em vigor
- Certifique-se de estar usando o mesmo email que está na lista de usuários de teste

