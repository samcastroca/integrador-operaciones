@echo off
rem Arranca el integrador y abre el navegador cuando responde /health (subtarea 7.1).
rem Si ya está corriendo, solo abre el navegador. Respeta PORT; con INTEGRADOR_SIN_NAVEGADOR=1 no lo abre.
chcp 65001 >nul
setlocal
cd /d "%~dp0"
rem Node portátil que instala instalar.ps1 cuando el equipo no tiene Node.js 22 o 24.
if exist "%~dp0node\node.exe" set "PATH=%~dp0node;%PATH%"
title Integrador Faktur
if not defined PORT set "PORT=4000"
set "SALUD=http://127.0.0.1:%PORT%/health"
set "URL=http://localhost:%PORT%"

curl.exe -s -f -o nul -m 2 "%SALUD%"
if not errorlevel 1 (
    if not "%INTEGRADOR_SIN_NAVEGADOR%"=="1" start "" "%URL%"
    exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
    echo No se encontró Node.js. Ejecuta instalar.ps1: lo instala dentro de la carpeta del integrador.
    pause
    exit /b 1
)

if not "%INTEGRADOR_SIN_NAVEGADOR%"=="1" start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%SALUD%' | Out-Null; Start-Process '%URL%'; exit } catch { Start-Sleep -Milliseconds 500 } }"

echo Integrador Faktur en %URL%
echo Deja esta ventana abierta mientras lo usas; puedes minimizarla. Ciérrala para apagarlo.
node importador_facturas_manual.mjs
if errorlevel 1 pause
