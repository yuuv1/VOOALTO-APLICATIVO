@echo off
REM ============================================================
REM  Vooalto V7 - Instalando e abrindo
REM ============================================================
REM  COMO TROCAR A PORTA:
REM   Opcao 1: edite o valor na linha "set PORTA=4085" abaixo.
REM   Opcao 2: passe a porta como argumento:
REM           instalar_e_abrir_V7.bat 5000
REM
REM  LIMPAR O CACHE:
REM   Este script NAO limpa nada automaticamente.
REM   Se quiser limpar o cache, abra manualmente:
REM   http://localhost:PORTA/limpar_cache.html
REM ============================================================
setlocal
cd /d "%~dp0"

set "PORTA=4085"
if not "%~1"=="" set "PORTA=%~1"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js nao encontrado. Instale em: https://nodejs.org/
    pause
    exit /b 1
)

echo Iniciando Vooalto V7 na porta %PORTA%...
echo (Pare com Ctrl+C para encerrar o servidor)
set "PORT=%PORTA%"
start "" "http://localhost:%PORTA%"
node server.js
endlocal
