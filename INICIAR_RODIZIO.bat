@echo off
chcp 65001 >nul
title Rodízio Digital — Barbearia (Servidor Local)
cd /d "%~dp0"

echo ==============================================================
echo   RODÍZIO DIGITAL — INICIALIZADOR DO NOTEBOOK DA RECEPÇÃO
echo ==============================================================
echo.

if not exist "node_modules" (
  echo [1/3] Instalando dependencias pela primeira vez...
  call npm.cmd install
  if errorlevel 1 (
    echo Falha ao instalar dependencias. Verifique se o Node.js 22+ esta instalado.
    pause
    exit /b 1
  )
)

if not exist "dist\server\backend\index.js" (
  echo [2/3] Compilando aplicacao local...
  call npm.cmd run build
  if errorlevel 1 (
    echo Falha ao compilar a aplicacao.
    pause
    exit /b 1
  )
)

echo [3/3] Iniciando servidor local...
call npm.cmd start
pause

