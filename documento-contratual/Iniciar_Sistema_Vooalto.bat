@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Ambiente ainda nao instalado. Executando instalador automatico...
    call "%~dp0Instalar_Sistema_Vooalto.bat"
    exit /b %ERRORLEVEL%
)

".venv\Scripts\python.exe" "scripts\iniciar_sistema.py"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Falha ao iniciar o servidor local. Veja os detalhes acima ou em logs\servidor_pwa.log.
    pause
    exit /b 1
)

exit /b 0
