@echo off
chcp 65001 >nul 2>nul
setlocal
title Instalador Vooalto V7
color 0A
cd /d "%~dp0"

echo =========================================================
echo   VOOALTO V7 - Instalacao e Servidor
echo =========================================================
echo.

REM ---------------------------------------------------------
REM 1) LOCALIZAR O NODE.JS
REM    Muitas vezes o Node foi instalado mas o PATH da sessao
REM    do Explorer esta desatualizado, ou foi instalado so
REM    para o usuario corrente. Temos varios fallbacks.
REM ---------------------------------------------------------
set "NODE_EXE="

REM Adiciona caminhos comuns de instalacao ao PATH desta sessao
set "PATH=C:\Program Files\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\nvm;%PROGRAMDATA%\nvm;%PATH%"
for /d %%D in ("%APPDATA%\nvm\v*" "%PROGRAMDATA%\nvm\v*") do (
  if exist "%%D\node.exe" set "PATH=%%D;%PATH%"
)

REM Tenta 1: node direto (mais confiavel que 'where')
node -v >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"

REM Tenta 2: where
if not defined NODE_EXE (
  for /f "delims=" %%I in ('where node 2^>nul') do (
    if exist "%%I" set "NODE_EXE=%%I"& goto :node_ok
  )
)

REM Tenta 3: caminhos bem conhecidos
for %%P in (
  "%ProgramFiles%\nodejs\node.exe"
  "%ProgramFiles(x86)%\nodejs\node.exe"
  "%LOCALAPPDATA%\Programs\nodejs\node.exe"
  "%LOCALAPPDATA%\Programs\node\node.exe"
) do if exist %%P set "NODE_EXE=%%~fP"& goto :node_ok

if not defined NODE_EXE (
  for /f "delims=" %%V in ('dir /b /o-n "%APPDATA%\nvm\v*" 2^>nul') do (
    if exist "%APPDATA%\nvm\%%V\node.exe" set "NODE_EXE=%APPDATA%\nvm\%%V\node.exe"& goto :node_ok
  )
  for /f "delims=" %%V in ('dir /b /o-n "%PROGRAMDATA%\nvm\v*" 2^>nul') do (
    if exist "%PROGRAMDATA%\nvm\%%V\node.exe" set "NODE_EXE=%PROGRAMDATA%\nvm\%%V\node.exe"& goto :node_ok
  )
)

:node_ok
if not defined NODE_EXE (
  echo [ERRO] Node.js nao foi encontrado neste computador.
  echo.
  echo O Vooalto V7 precisa do Node.js (versao LTS, gratuita).
  echo Vamos abrir a pagina de download para voce...
  echo   https://nodejs.org/
  echo.
  echo Depois de instalar, feche e abra este arquivo novamente.
  echo.
  start "" "https://nodejs.org/pt-br/download/"
  pause
  exit /b 1
)

for /f "delims=" %%V in ('"%NODE_EXE%" -v 2^>nul') do set "NODE_VER=%%V"
echo [OK] Node.js encontrado  (%NODE_VER%)
echo.

REM ---------------------------------------------------------
REM 2) VERIFICA PORTA 4700
REM ---------------------------------------------------------
set "PORT_BUSY="
node -e "const s=require('net').createConnection({port:4700,host:'127.0.0.1'},()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));" >nul 2>nul
if not errorlevel 1 set "PORT_BUSY=1"

if defined PORT_BUSY (
  echo [AVISO] A porta 4700 ja esta em uso.
  echo O Vooalto V7 provavelmente ja esta rodando. Abrindo navegador...
  echo.
  start "" "http://localhost:4700"
  goto :FIM
)

REM ---------------------------------------------------------
REM 3) INICIA O SERVIDOR (janela visivel)
REM ---------------------------------------------------------
echo [1/3] Iniciando servidor em http://localhost:4700 ...
start "Vooalto V7 - Servidor (feche para parar)" cmd /k ""%NODE_EXE%" server.js"

echo [2/3] Aguardando servidor responder ...
set /a TENTATIVA=0
:AGUARDAR
set /a TENTATIVA+=1
timeout /t 1 /nobreak >nul

REM Health-check: tenta primeiro via Node (sem dependencias)
node -e "const s=require('net').createConnection({port:4700,host:'127.0.0.1'},()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));" >nul 2>nul
if not errorlevel 1 goto :SERVIDOR_OK

REM Fallback: curl.exe (vem no Windows 10/11)
curl.exe -s -o nul -f http://localhost:4700/ >nul 2>nul
if not errorlevel 1 goto :SERVIDOR_OK

REM Fallback final: PowerShell
powershell -NoProfile -Command "try{$r=Invoke-WebRequest -Uri 'http://localhost:4700/' -UseBasicParsing -TimeoutSec 1;exit 0}catch{exit 1}" >nul 2>nul
if not errorlevel 1 goto :SERVIDOR_OK

if %TENTATIVA% LSS 30 goto AGUARDAR

echo.
echo [ERRO] Servidor nao respondeu apos 30 segundos.
echo Verifique a janela "Vooalto V7 - Servidor" que abriu para ver o erro.
echo.
pause
exit /b 1

:SERVIDOR_OK
echo [3/3] Abrindo Vooalto V7 no navegador ...
start "" "http://localhost:4700"

:FIM
echo.
echo =========================================================
echo   VOOALTO V7 esta rodando!
echo   - Aplicativo:   http://localhost:4700
echo   - Limpar cache: http://localhost:4700/limpar_cache.html
echo   - Zerar dados:  http://localhost:4700/zerar_dados.html
echo.
echo   Para PARAR o servidor, feche a janela preta
echo   "Vooalto V7 - Servidor".
echo.
echo   Para INSTALAR como app offline (PWA): no Chrome/Edge,
echo   clique no icone "Instalar" na barra de endereco apos
echo   o app abrir pela primeira vez.
echo =========================================================
echo.
pause
endlocal
