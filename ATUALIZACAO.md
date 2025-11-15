# 🔄 Como Atualizar a Extensão EmailZen

## Método Automático (Recomendado)

### Windows

1. **Execute o script de atualização:**
   - Clique duas vezes em `atualizar.bat`
   - Ou execute no PowerShell: `.\atualizar.ps1`

2. **O script irá:**
   - Verificar se há atualizações no GitHub
   - Baixar as atualizações automaticamente
   - Descartar mudanças locais (se necessário)

3. **Recarregue a extensão:**
   - Abra `chrome://extensions/`
   - Clique no botão de recarregar (↻) na extensão EmailZen

## Método Manual

1. **Abra o terminal na pasta do projeto:**
   ```bash
   cd C:\projetos\EmailZen
   ```

2. **Busque atualizações:**
   ```bash
   git fetch origin
   ```

3. **Verifique se há atualizações:**
   ```bash
   git status
   ```

4. **Baixe as atualizações:**
   ```bash
   git pull origin main
   ```

5. **Recarregue a extensão:**
   - Abra `chrome://extensions/`
   - Clique no botão de recarregar (↻) na extensão EmailZen

## ⚠️ Importante

- **Mudanças locais:** Se você fez alterações locais, o script perguntará se deseja descartá-las
- **Backup:** Se quiser manter suas mudanças, faça commit antes de atualizar:
  ```bash
  git add .
  git commit -m "Minhas alterações"
  git pull origin main
  ```

## 🔍 Verificar Versão Atual

Para ver qual versão você está usando:
```bash
git log -1 --oneline
```

## 📝 Notas

- O script de atualização funciona apenas se o projeto estiver conectado a um repositório Git
- Se você clonou do GitHub, já está configurado
- Se criou o projeto localmente, você precisa conectar ao repositório primeiro

