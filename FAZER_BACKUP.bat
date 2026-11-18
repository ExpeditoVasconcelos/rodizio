@echo off
chcp 65001 >nul
title Rodízio Digital — Backup do Banco SQLite
cd /d "%~dp0"

if not exist "dist\server\backend\cli\backup.js" (
  call npm.cmd run build:server
)

call npm.cmd run backup
echo.
pause

