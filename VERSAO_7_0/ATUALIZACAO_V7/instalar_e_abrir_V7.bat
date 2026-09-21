@echo off
echo Vooalto V7 - Instalando e abrindo...
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js nao encontrado. Instale em: https://nodejs.org/
    pause
    exit /b 1
)
echo Iniciando servidor na porta 4700...
echo App:       http://localhost:4700
echo Limpar:    http://localhost:4700/limpar_cache.html
echo Zerar:     http://localhost:4700/zerar_dados.html
echo (Para parar, feche esta janela.)
echo.
start "" http://localhost:4700
node server.js
