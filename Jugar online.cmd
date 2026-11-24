@echo off
rem Doble clic: pone La Puja en internet desde este PC (lo mismo que "npm run online").
chcp 65001 >nul
title La Puja online
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No encuentro Node.js. Instalalo desde https://nodejs.org y vuelve a abrir esto.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando lo necesario, solo la primera vez...
  call npm install
  if errorlevel 1 (
    echo No se ha podido instalar. Mira el error de arriba.
    pause
    exit /b 1
  )
)

node scripts\online.js %*
echo.
pause
