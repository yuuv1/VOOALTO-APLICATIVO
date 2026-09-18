@echo off
setlocal
title Instalador Vooalto V7
color 0A
cd /d "%~dp0"

echo ══════════════════════════════════════════════════════
echo   VOOALTO V7 - Instalacao e Servidor
echo ══════════════════════════════════════════════════════
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

echo [1/3] Iniciando o servidor em http://localhost:4700 ...
start "" /min cmd /c "node server.js"

echo [2/3] Aguardando o servidor subir ...
set /a TENTATIVA=0
:AGUARDAR
set /a TENTATIVA+=1
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try{$r=Invoke-WebRequest -Uri 'http://localhost:4700' -UseBasicParsing -TimeoutSec 2; exit 0}catch{exit 1}" >nul 2>nul
if errorlevel 1 (
  if %TENTATIVA% LSS 25 goto AGUARDAR
  echo [ERRO] Servidor nao respondeu apos 25 segundos.
  pause
  exit /b 1
)

echo [3/3] Abrendo o Vooalto V7 no navegador ...
start "" "http://localhost:4700"

echo.
echo ══════════════════════════════════════════════════════
echo   VOOALTO V7 esta rodando!
echo   - Aplicativo:        http://localhost:4700
echo   - Limpar cache:      http://localhost:4700/limpar_cache.html
echo   - Zerar dados:       http://localhost:4700/zerar_dados.html
echo.
echo   Para parar o servidor, feche a janela do Node
echo   (o quadro preto minimizado que abriu).
echo ══════════════════════════════════════════════════════
echo.
pause
endlocal
