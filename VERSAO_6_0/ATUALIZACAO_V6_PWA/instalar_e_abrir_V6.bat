@echo off
setlocal EnableDelayedExpansion
title Vooalto V6
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo   Node.js nao encontrado. Instale em: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

set "PORTA=4085"
if exist "porta.txt" set /p PORTA=<porta.txt
if "%PORTA%"=="" set "PORTA=4085"

:MENU
cls
echo.
echo   ============================================
echo      VOOALTO V6 - Ficha Tecnica e Orcamento
echo   ============================================
echo.
echo   Porta atual: %PORTA%
echo   Endereco:    http://localhost:%PORTA%
echo.
echo   [1] Abrir o Vooalto
echo   [2] Abrir limpando o cache
echo       (use se o sistema abrir desatualizado)
echo   [3] Trocar a porta
echo   [4] Sair
echo.
set "OPCAO="
set /p "OPCAO=  Escolha uma opcao (ou Enter para abrir): "

if "%OPCAO%"=="" goto ABRIR
if "%OPCAO%"=="1" goto ABRIR
if "%OPCAO%"=="2" goto LIMPAR
if "%OPCAO%"=="3" goto TROCAR
if "%OPCAO%"=="4" exit /b 0
goto MENU

:TROCAR
echo.
echo   Escolha um numero entre 1024 e 65535.
echo   Sugestoes: 4085, 4086, 4090, 5000, 8080
echo.
echo   ATENCAO: cada porta guarda seus proprios dados.
echo   As fichas e o catalogo salvos em uma porta NAO
echo   aparecem em outra. Para nao perder nada, use
echo   sempre a mesma porta no dia a dia.
echo.
echo   Se o problema for o sistema abrir desatualizado,
echo   prefira a opcao [2], que preserva suas fichas.
echo.
set "NOVA="
set /p "NOVA=  Nova porta (Enter para cancelar): "
if "%NOVA%"=="" goto MENU

echo %NOVA%| findstr /r "^[1-9][0-9]*$" >nul
if errorlevel 1 (
    echo.
    echo   Valor invalido. Digite apenas numeros.
    timeout /t 3 >nul
    goto MENU
)
if %NOVA% LSS 1024 (
    echo.
    echo   Use um numero a partir de 1024.
    timeout /t 3 >nul
    goto MENU
)
if %NOVA% GTR 65535 (
    echo.
    echo   Use um numero ate 65535.
    timeout /t 3 >nul
    goto MENU
)

set "PORTA=%NOVA%"
echo %PORTA%>porta.txt
echo.
echo   Porta alterada para %PORTA% e salva para as proximas vezes.
timeout /t 2 >nul
goto MENU

:LIMPAR
cls
echo.
echo   Abrindo o Vooalto e limpando o cache...
echo.
echo   Suas fichas, rascunhos e o catalogo NAO sao apagados.
echo   Apenas os arquivos que o navegador guardou serao
echo   recarregados do zero.
echo.
echo   Para fechar o Vooalto, feche esta janela preta.
echo.
start "" http://localhost:%PORTA%/limpar_cache.html
node server.js %PORTA%
echo.
echo   O servidor foi encerrado.
pause
exit /b 0

:ABRIR
cls
echo.
echo   Iniciando o Vooalto na porta %PORTA%...
echo   Endereco: http://localhost:%PORTA%
echo.
echo   Para fechar o Vooalto, feche esta janela preta.
echo.
start "" http://localhost:%PORTA%
node server.js %PORTA%
echo.
echo   O servidor foi encerrado.
pause
