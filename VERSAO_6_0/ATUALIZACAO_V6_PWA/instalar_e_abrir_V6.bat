@echo off
echo Vooalto V6 - Instalando e abrindo...
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js nao encontrado. Instale em: https://nodejs.org/
    pause
    exit /b 1
)
echo Iniciando servidor na porta 4085...
start "" http://localhost:4085
node server.js
