# Script de Atualização Automática - EmailZen
# Este script atualiza a extensão a partir do repositório GitHub

Write-Host "🔄 Atualizando EmailZen do GitHub..." -ForegroundColor Cyan

# Verifica se está no diretório correto
if (-not (Test-Path "manifest.json")) {
    Write-Host "❌ Erro: Execute este script na pasta raiz do projeto EmailZen" -ForegroundColor Red
    exit 1
}

# Verifica se o Git está instalado
try {
    $gitVersion = git --version
    Write-Host "✅ Git encontrado: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro: Git não está instalado ou não está no PATH" -ForegroundColor Red
    exit 1
}

# Verifica se há mudanças locais não commitadas
$status = git status --porcelain
if ($status) {
    Write-Host "⚠️  Atenção: Há mudanças locais não salvas:" -ForegroundColor Yellow
    Write-Host $status
    $resposta = Read-Host "Deseja descartar as mudanças locais e atualizar? (s/N)"
    if ($resposta -ne "s" -and $resposta -ne "S") {
        Write-Host "❌ Atualização cancelada" -ForegroundColor Red
        exit 0
    }
    Write-Host "🗑️  Descartando mudanças locais..." -ForegroundColor Yellow
    git reset --hard HEAD
    git clean -fd
}

# Busca atualizações do GitHub
Write-Host "📥 Buscando atualizações do GitHub..." -ForegroundColor Cyan
git fetch origin

# Verifica se há atualizações
$localCommit = git rev-parse HEAD
$remoteCommit = git rev-parse origin/main

if ($localCommit -eq $remoteCommit) {
    Write-Host "✅ Você já está na versão mais recente!" -ForegroundColor Green
    exit 0
}

# Faz o pull das atualizações
Write-Host "⬇️  Baixando atualizações..." -ForegroundColor Cyan
git pull origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Atualização concluída com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Próximos passos:" -ForegroundColor Cyan
    Write-Host "1. Abra chrome://extensions/" -ForegroundColor White
    Write-Host "2. Clique no botão de recarregar (↻) na extensão EmailZen" -ForegroundColor White
    Write-Host "3. Ou remova e carregue novamente a extensão" -ForegroundColor White
} else {
    Write-Host "❌ Erro ao atualizar. Verifique se há conflitos." -ForegroundColor Red
    exit 1
}

