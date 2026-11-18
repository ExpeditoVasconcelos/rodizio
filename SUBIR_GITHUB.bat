@echo off
chcp 65001 >nul
title Subir Rodízio Digital para o GitHub
cd /d "%~dp0"

set "GIT_ROOT=C:\Users\fabio.vasconcelos\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git"
set "PATH=%GIT_ROOT%\cmd;%GIT_ROOT%\ucrt64\bin;%PATH%"

echo ==============================================================
echo   ENVIANDO PARA: https://github.com/ExpeditoVasconcelos/rodizio.git
echo ==============================================================
echo.

git add .
git diff --cached --quiet || git commit -m "chore: atualizacao do projeto Barba de Urso"
git push -u origin main

echo.
if errorlevel 1 (
  echo Falha ao enviar. Verifique o login do GitHub e tente novamente.
) else (
  echo Envio concluido com sucesso!
)
pause
