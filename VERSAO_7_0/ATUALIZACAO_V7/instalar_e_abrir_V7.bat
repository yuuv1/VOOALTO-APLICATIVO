@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Vooalto V7 - Servidor Local
set PORT=4700
set URL=http://localhost:%PORT%

echo ====================================================
echo   VOOALTO V7 - UNIFORMES (Aplicativo Offline / PWA)
echo ====================================================
echo.

where node >nul 2>nul
if %errorlevel% equ 0 goto :run_node

if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
if defined NVM_SYMLINK if exist "%NVM_SYMLINK%\node.exe" set "PATH=%NVM_SYMLINK%;%PATH%"

where node >nul 2>nul
if %errorlevel% equ 0 goto :run_node

where python >nul 2>nul
if %errorlevel% equ 0 goto :run_python

where py >nul 2>nul
if %errorlevel% equ 0 goto :run_py

echo [!] Node.js nao foi encontrado neste computador.
echo     Instale o Node.js LTS em: https://nodejs.org
echo     e execute novamente este arquivo.
echo.
start "" "https://nodejs.org"
pause
exit /b 1

:run_node
echo [OK] Iniciando servidor local em %URL% ...
echo      (Mantenha esta janela aberta enquanto usar o Vooalto V7)
echo.
node "%~dp0server.js" --open
if %errorlevel% neq 0 (
  echo.
  echo [!] O servidor encerrou com erro. Pressione qualquer tecla para sair.
  pause >nul
)
exit /b 0

:run_python
echo [OK] Iniciando servidor via Python em %URL% ...
echo      (Mantenha esta janela aberta enquanto usar o Vooalto V7)
echo.
call :open_browser
python -m http.server %PORT%
pause
exit /b 0

:run_py
echo [OK] Iniciando servidor via Python Launcher em %URL% ...
echo      (Mantenha esta janela aberta enquanto usar o Vooalto V7)
echo.
call :open_browser
py -3 -m http.server %PORT%
pause
exit /b 0

:open_browser
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" --app=%URL%
  goto :eof
)
if exist "%CHROME%" (
  start "" "%CHROME%" --app=%URL%
  goto :eof
)
start "" "%URL%"
goto :eof
