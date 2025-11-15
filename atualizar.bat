@echo off
REM Script de Atualização Automática - EmailZen (Windows)
REM Este script atualiza a extensão a partir do repositório GitHub

echo 🔄 Atualizando EmailZen do GitHub...

REM Verifica se está no diretório correto
if not exist "manifest.json" (
    echo ❌ Erro: Execute este script na pasta raiz do projeto EmailZen
    pause
    exit /b 1
)

REM Executa o script PowerShell
powershell.exe -ExecutionPolicy Bypass -File "atualizar.ps1"

pause

