@echo off
chcp 65001 >nul
title Subir Rodízio Digital para o GitHub
cd /d "%~dp0"

set "GIT=C:\Users\fabio.vasconcelos\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"

echo ==============================================================
echo   ENVIANDO PARA: https://github.com/ExpeditoVasconcelos/rodizio.git
echo ==============================================================
echo.
echo Uma janela de login do GitHub (Git Credential Manager) podera abrir
echo para autorizar o envio.
echo.

"%GIT%" push -u origin main

echo.
if errorlevel 1 (
  echo Falha ao enviar. Verifique o login do GitHub e tente novamente.
) else (
  echo Envio concluido com sucesso!
)
pause
