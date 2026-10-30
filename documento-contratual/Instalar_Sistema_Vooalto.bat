@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Instalador do Sistema VOOALTO Uniformes - Contratos PWA

cd /d "%~dp0"

echo ============================================================================
echo    VOOALTO UNIFORMES - INSTALADOR DO SISTEMA AUTOMATICO DE CONTRATOS (PWA)
echo ============================================================================
echo.

set "PY_CMD="
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3,9) else 1)" >nul 2>nul
    if !ERRORLEVEL! EQU 0 set "PY_CMD=py -3"
)

if "%PY_CMD%"=="" (
    where python >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        python -c "import sys; raise SystemExit(0 if sys.version_info >= (3,9) else 1)" >nul 2>nul
        if !ERRORLEVEL! EQU 0 set "PY_CMD=python"
    )
)

if "%PY_CMD%"=="" (
    echo [1/4] Python 3 nao encontrado. Tentando instalar automaticamente via Windows Winget...
    where winget >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"
        if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
            set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
        )
    )
)

if "%PY_CMD%"=="" (
    echo.
    echo [AVISO] Nao foi possivel localizar o Python 3 automaticamente.
    echo Baixe e instale o Python 3 marcando "Add Python to PATH" em:
    echo   https://www.python.org/downloads/
    echo Em seguida, execute novamente este arquivo Instalar_Sistema_Vooalto.bat.
    start "" "https://www.python.org/downloads/"
    pause
    exit /b 1
)

echo [1/4] Python detectado com sucesso: %PY_CMD%
echo.

echo [2/4] Preparando ambiente isolado (.venv)...
if not exist ".venv\Scripts\python.exe" (
    %PY_CMD% -m venv .venv
    if !ERRORLEVEL! NEQ 0 (
        echo [ERRO] Falha ao criar a pasta .venv. Verifique espaco em disco e permissoes.
        pause
        exit /b 1
    )
)

echo [3/4] Instalando e verificando motores de OCR, PDF, Word e atalhos...
".venv\Scripts\python.exe" "scripts\instalar_dependencias.py"
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao instalar dependencias Python. Verifique sua conexao com a internet.
    pause
    exit /b 1
)

echo.
echo [4/4] Subindo servidor local e abrindo o aplicativo VOOALTO Contratos...
call "%~dp0Iniciar_Sistema_Vooalto.bat"
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b 1
)

echo.
echo ============================================================================
echo    SISTEMA VOOALTO CONTRATOS ATIVO EM: http://127.0.0.1:8765
echo    Atalho criado na Area de Trabalho: "VOOALTO Contratos"
echo ============================================================================
timeout /t 4 >nul
exit /b 0
