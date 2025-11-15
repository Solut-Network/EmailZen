# 📧 EmailZen

Extensão completa para Google Chrome que organiza emails do Gmail automaticamente usando filtros inteligentes e exclusão automática.

## 🚀 Funcionalidades

### 1. Painel de Organização
- Painel lateral no Gmail (similar ao Google Tasks)
- Visualização de categorias/marcadores personalizados
- Contador de emails por categoria
- Botão flutuante para abrir/fechar o painel

### 2. Sistema de Filtros Automáticos
- Interface intuitiva para criar regras de filtro com:
  - **Remetente**: email ou domínio (ex: `@newsletter.com`)
  - **Assunto**: palavras-chave
  - **Conteúdo**: busca no corpo do email
- Ações configuráveis para cada regra:
  - Aplicar marcador/label específico
  - Marcar como lido automaticamente
  - Arquivar automaticamente
  - Definir tempo de retenção (dias)

### 3. Visualização Inteligente
- Inbox mostra apenas emails que não correspondem a nenhum filtro
- "Inbox Humana" - emails que precisam de atenção real
- Opção de visualizar cada categoria separadamente

### 4. Exclusão Automática
- Configuração de tempo de retenção por categoria (ex: 7 dias, 30 dias)
- Background script verifica diariamente
- Move para lixeira emails antigos automaticamente
- Histórico de processamento

### 5. Página de Configurações
- Lista de todas as regras criadas
- Adicionar/editar/excluir regras
- Ativar/desativar regras temporariamente
- Estatísticas (emails processados, espaço economizado)

## 📋 Pré-requisitos

1. **Google Chrome** (versão 88 ou superior)
2. **Conta Google** com acesso ao Gmail
3. **Credenciais OAuth 2.0** do Google (veja instruções abaixo)

## 🔑 Como Obter Credenciais OAuth do Google

### Passo 1: Criar Projeto no Google Cloud Console

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione um existente
3. Ative a **Gmail API**:
   - Vá em "APIs e Serviços" > "Biblioteca"
   - Procure por "Gmail API"
   - Clique em "Ativar"

### Passo 2: Configurar Tela de Consentimento OAuth

1. Vá em "APIs e Serviços" > "Tela de consentimento OAuth"
2. Escolha "Externo" (ou "Interno" se usar Google Workspace)
3. Preencha as informações obrigatórias:
   - Nome do aplicativo: `EmailZen`
   - Email de suporte
   - Logo (opcional)
4. Adicione os escopos:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.labels`
   - `https://www.googleapis.com/auth/gmail.readonly`
5. Adicione usuários de teste (se necessário)
6. Salve e continue

### Passo 3: Criar Credenciais OAuth 2.0

1. Vá em "APIs e Serviços" > "Credenciais"
2. Clique em "Criar credenciais" > "ID do cliente OAuth"
3. Escolha "Aplicativo Chrome"
4. Preencha:
   - Nome: `EmailZen Extension`
   - ID do aplicativo: deixe vazio (será gerado automaticamente)
5. Clique em "Criar"
6. **Copie o Client ID** gerado

### Passo 4: Configurar na Extensão

1. Abra o arquivo `manifest.json`
2. Substitua `SEU_CLIENT_ID_AQUI.apps.googleusercontent.com` pelo seu Client ID
3. Salve o arquivo

**Exemplo:**
```json
"oauth2": {
  "client_id": "123456789-abcdefghijklmnop.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/gmail.readonly"
  ]
}
```

## 📦 Instalação

### Modo Desenvolvedor

1. **Baixe ou clone este repositório**
   ```bash
   git clone <url-do-repositorio>
   cd gmail-organizer
   ```

2. **Configure o Client ID OAuth**
   - Edite `manifest.json` e substitua o Client ID (veja seção acima)

3. **Abra o Chrome e vá para Extensões**
   - Digite na barra de endereços: `chrome://extensions/`
   - Ou: Menu (⋮) > Mais ferramentas > Extensões

4. **Ative o Modo Desenvolvedor**
   - No canto superior direito, ative o toggle "Modo do desenvolvedor"

5. **Carregue a extensão**
   - Clique em "Carregar sem compactação"
   - Selecione a pasta `gmail-organizer` (pasta raiz do projeto)
   - A extensão será instalada

6. **Verifique a instalação**
   - Você verá o ícone da extensão na barra de ferramentas
   - Abra o Gmail em uma nova aba

## 🎯 Como Usar

### Primeira Configuração

1. **Autenticar com Google**
   - Clique no ícone da extensão na barra de ferramentas
   - Clique em "Autenticar com Google"
   - Autorize o acesso ao Gmail
   - Aguarde confirmação de autenticação

2. **Criar Primeira Regra**
   - Clique no ícone da extensão > "Abrir Configurações"
   - Ou clique com botão direito no ícone > "Opções"
   - Clique em "Nova Regra"
   - Preencha:
     - **Nome**: Ex: "Newsletters"
     - **Remetente**: `@substack.com, @newsletter.`
     - **Aplicar Label**: `Newsletters`
     - **Marcar como lido**: ✓
     - **Tempo de Retenção**: `7` dias
   - Clique em "Salvar Regra"

3. **Processar Emails**
   - O processamento acontece automaticamente a cada 30 minutos
   - Ou clique no botão flutuante no Gmail > "Processar Emails Agora"

### Usando o Painel Lateral

1. **Abrir Painel**
   - No Gmail, clique no botão flutuante (canto inferior direito)
   - Ou aguarde o painel aparecer automaticamente

2. **Visualizar Categorias**
   - Veja todas as categorias configuradas
   - Contador de emails por categoria
   - Clique em uma categoria para filtrar

3. **Processar Manualmente**
   - Clique em "Processar Emails Agora" para aplicar regras imediatamente

## 📝 Exemplos de Regras

### Newsletters (Excluir após 7 dias)
```javascript
{
  nome: "Newsletters",
  condicoes: {
    remetente: ["@substack.com", "@newsletter.", "@mailchimp.com"]
  },
  acoes: {
    label: "Newsletters",
    marcarLido: true,
    arquivar: true,
    retencaoDias: 7
  }
}
```

### Notificações Sociais (Excluir após 3 dias)
```javascript
{
  nome: "Notificações Sociais",
  condicoes: {
    remetente: ["@facebook.com", "@twitter.com", "@linkedin.com"]
  },
  acoes: {
    label: "Social",
    marcarLido: true,
    arquivar: true,
    retencaoDias: 3
  }
}
```

### Recibos e Compras (Manter 1 ano)
```javascript
{
  nome: "Recibos e Compras",
  condicoes: {
    assunto: ["recibo", "pedido", "compra", "invoice", "receipt"]
  },
  acoes: {
    label: "Financeiro",
    marcarLido: false,
    arquivar: false,
    retencaoDias: 365
  }
}
```

## 🏗️ Estrutura do Projeto

```
gmail-organizer/
├── manifest.json              # Configuração da extensão
├── icons/                     # Ícones da extensão
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── content/                   # Scripts injetados no Gmail
│   ├── content.js            # Lógica do painel lateral
│   └── content.css           # Estilos do painel
├── background/                # Service Worker
│   └── service-worker.js     # Processamento em background
├── popup/                     # Interface do ícone
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/                   # Página de configurações
│   ├── options.html
│   ├── options.js
│   └── options.css
└── utils/                     # Utilitários
    ├── gmail-api.js          # Funções da Gmail API
    └── storage.js            # Gerenciamento de dados
```

## 🔧 Tecnologias Utilizadas

- **Chrome Extensions API** (Manifest V3)
- **Gmail API v1**
- **OAuth 2.0** para autenticação
- **Chrome Storage API** para persistência
- **Chrome Alarms API** para tarefas periódicas

## ⚙️ Configurações Avançadas

### Processamento Automático

- **Emails**: Processa a cada 30 minutos
- **Exclusões**: Verifica uma vez por dia (24 horas)

Para alterar, edite `background/service-worker.js`:

```javascript
// Processa emails a cada 30 minutos
chrome.alarms.create('processarEmails', {
  periodInMinutes: 30
});

// Verifica exclusões uma vez por dia
chrome.alarms.create('verificarExclusoes', {
  periodInMinutes: 24 * 60
});
```

### Rate Limiting

A extensão respeita os limites da Gmail API:
- **250 unidades de quota por segundo por usuário**
- Processamento em batches de 10 mensagens
- Delay de 100ms entre batches

## 🐛 Solução de Problemas

### Erro de Autenticação

**Problema**: "Erro na autenticação" ou "Token inválido"

**Soluções**:
1. Verifique se o Client ID está correto no `manifest.json`
2. Certifique-se de que a Gmail API está ativada no Google Cloud Console
3. Verifique se os escopos estão configurados corretamente
4. Tente fazer logout e autenticar novamente

### Emails Não Estão Sendo Processados

**Problema**: Regras criadas mas emails não são processados

**Soluções**:
1. Verifique se as regras estão ativas (toggle na página de opções)
2. Verifique se as condições da regra correspondem aos emails
3. Clique em "Processar Emails Agora" manualmente
4. Verifique o console do Service Worker (chrome://extensions > Detalhes > Inspecionar visualizações > service-worker)

### Painel Lateral Não Aparece

**Problema**: Botão flutuante não aparece no Gmail

**Soluções**:
1. Recarregue a página do Gmail (F5)
2. Verifique se a extensão está ativa (chrome://extensions)
3. Verifique o console do navegador para erros (F12)
4. Certifique-se de estar logado no Gmail

### Labels Não São Criados

**Problema**: Labels não aparecem no Gmail

**Soluções**:
1. Verifique permissões OAuth (deve incluir `gmail.labels`)
2. Verifique se há erros no console
3. Tente criar o label manualmente no Gmail primeiro
4. Limpe o cache: vá em opções > remover todas as regras > recriar

## 📊 Estatísticas

A extensão mantém estatísticas de:
- **Emails Processados**: Total de emails que tiveram regras aplicadas
- **Emails Excluídos**: Total de emails movidos para lixeira
- **Regras Ativas**: Número de regras atualmente ativas

Acesse as estatísticas na página de opções ou no popup da extensão.

## 🔒 Privacidade e Segurança

- **Dados Locais**: Todas as configurações e regras são armazenadas localmente no Chrome
- **Sem Servidor**: A extensão não envia dados para servidores externos
- **OAuth Seguro**: Usa OAuth 2.0 oficial do Google
- **Permissões Mínimas**: Solicita apenas permissões necessárias para funcionar

## 📄 Licença

Este projeto é fornecido "como está", sem garantias. Use por sua conta e risco.

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para:
- Reportar bugs
- Sugerir funcionalidades
- Enviar pull requests

## 📧 Suporte

Para problemas ou dúvidas:
1. Verifique a seção "Solução de Problemas" acima
2. Verifique os logs do Service Worker
3. Abra uma issue no repositório

## 🎉 Pronto para Usar!

Agora você tem uma extensão completa para organizar seus emails do Gmail automaticamente. Configure suas regras e aproveite uma inbox mais limpa e organizada!

---

**Nota**: Esta extensão não é oficial do Google e não é afiliada ao Google ou Gmail.

