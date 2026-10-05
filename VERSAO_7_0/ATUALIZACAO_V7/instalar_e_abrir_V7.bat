@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0" || goto :startup_error
title Vooalto V7 - Servidor Local
set "PORT=4700"
set "URL=http://localhost:%PORT%/"

echo ====================================================
echo   VOOALTO V7 - SERVIDOR LOCAL (PWA)
echo ====================================================
echo.

where node.exe >nul 2>nul
if not errorlevel 1 goto :run_node

if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
if defined NVM_SYMLINK if exist "%NVM_SYMLINK%\node.exe" set "PATH=%NVM_SYMLINK%;%PATH%"
where node.exe >nul 2>nul
if not errorlevel 1 goto :run_node

where py.exe >nul 2>nul
if not errorlevel 1 (
  py -3 -c "import sys; assert sys.version_info[0] > 3 or sys.version_info[0] == 3 and sys.version_info[1] >= 10" >nul 2>nul
  if not errorlevel 1 goto :run_py
)

where python.exe >nul 2>nul
if not errorlevel 1 (
  python -c "import sys; assert sys.version_info[0] > 3 or sys.version_info[0] == 3 and sys.version_info[1] >= 10" >nul 2>nul
  if not errorlevel 1 goto :run_python
)

echo [!] Node.js e Python 3.10+ nao foram encontrados neste computador.
echo     Instale o Node.js LTS em https://nodejs.org e execute este BAT novamente.
echo.
start "" "https://nodejs.org"
pause
exit /b 1

:run_node
echo [OK] Iniciando servidor local em %URL% usando Node.js...
echo     O navegador sera aberto depois que o servidor estiver pronto.
echo     Minimize esta janela; nao a feche enquanto estiver usando o Vooalto.
echo.
node "%~dp0server.js" --open
set "APP_EXIT=%ERRORLEVEL%"
goto :after_server

:run_python
echo [OK] Iniciando servidor local em %URL% usando Python 3...
echo     O navegador sera aberto depois que o servidor estiver pronto.
echo     Minimize esta janela; nao a feche enquanto estiver usando o Vooalto.
echo.
python "%~dp0server.py" --open
set "APP_EXIT=%ERRORLEVEL%"
goto :after_server

:run_py
echo [OK] Iniciando servidor local em %URL% usando Python Launcher...
echo     O navegador sera aberto depois que o servidor estiver pronto.
echo     Minimize esta janela; nao a feche enquanto estiver usando o Vooalto.
echo.
py -3 "%~dp0server.py" --open
set "APP_EXIT=%ERRORLEVEL%"
goto :after_server

:after_server
if not "%APP_EXIT%"=="0" (
  echo.
  echo [!] O servidor encerrou com erro (codigo %APP_EXIT%).
  echo     Confira as mensagens acima e pressione uma tecla para sair.
  pause >nul
)
exit /b %APP_EXIT%

:startup_error
echo [!] Nao foi possivel abrir a pasta do Vooalto V7.
pause
exit /b 1
