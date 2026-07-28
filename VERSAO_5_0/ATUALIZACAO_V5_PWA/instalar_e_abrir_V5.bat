@echo off
echo Vooalto V5 - Instalando e abrindo...
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js nao encontrado. Instale em: https://nodejs.org/
    pause
    exit /b 1
)
echo Iniciando servidor na porta 4082...
start "" http://localhost:4082
node server.js
