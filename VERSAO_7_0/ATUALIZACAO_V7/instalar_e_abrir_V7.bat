@echo off
setlocal
title Instalador Vooalto V7
color 0A
cd /d "%~dp0"

echo =========================================================
echo   VOOALTO V7 - Instalacao e Servidor
echo =========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  echo Baixe e instale em: https://nodejs.org  (versao LTS)
  echo Depois, execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)
echo [OK] Node.js encontrado.

REM --- Verifica se a porta 4700 ja esta em uso ---
set "PORT_BUSY="
for /f "tokens=2,5" %%a in ('netstat -ano -p tcp ^| findstr /r /c:":4700  .*LISTENING"') do (
  echo %%a | findstr /r /c:":4700$" >nul && set "PORT_BUSY=1"
)
if defined PORT_BUSY (
  echo [AVISO] A porta 4700 ja parece estar em uso.
  echo Provavelmente o Vooalto V7 ja esta rodando.
  echo Abrindo o navegador mesmo assim...
  echo.
  start "" "http://localhost:4700"
  goto :FIM
)

echo [1/3] Iniciando o servidor em http://localhost:4700 ...
REM Inicia o node em uma janela separada VISIVEL (nao minimizada),
REM para que, se der erro (porta ocupada, etc.), o usuario consiga ver.
start "Vooalto V7 - Servidor (feche para parar)" cmd /k "node server.js"

echo [2/3] Aguardando o servidor subir ...
set /a TENTATIVA=0
:AGUARDAR
set /a TENTATIVA+=1
timeout /t 1 /nobreak >nul
REM Checagem TCP simples usando o proprio Node (ja confirmado disponivel).
REM Nao depende do PowerShell/IE engine, funciona em qualquer Windows.
node -e "const s=require('net').createConnection({port:4700,host:'127.0.0.1'},()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));" >nul 2>nul
if errorlevel 1 (
  if %TENTATIVA% LSS 30 goto AGUARDAR
  echo.
  echo [ERRO] Servidor nao respondeu apos 30 segundos.
  echo Verifique a janela "Vooalto V7 - Servidor" que abriu para ver o erro.
  echo (Causa comum: firewall, Node.js corrompido, ou outro erro no server.js)
  echo.
  pause
  exit /b 1
)

echo [3/3] Abrindo o Vooalto V7 no navegador ...
start "" "http://localhost:4700"

:FIM
echo.
echo =========================================================
echo   VOOALTO V7 esta rodando!
echo   - Aplicativo:        http://localhost:4700
echo   - Limpar cache:      http://localhost:4700/limpar_cache.html
echo   - Zerar dados:       http://localhost:4700/zerar_dados.html
echo.
echo   Para parar o servidor, feche a janela preta
echo   "Vooalto V7 - Servidor" que abriu.
echo =========================================================
echo.
echo Dica: no Chrome/Edge, clique em "Instalar" na barra de
echo endereco (ou no botao "Instalar" no topo do app) para ter
echo o Vooalto V7 como aplicativo offline na area de trabalho.
echo.
pause
endlocal
