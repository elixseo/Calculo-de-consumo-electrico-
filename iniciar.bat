@echo off
title Servidor Consumo Electrico
echo ==========================================================
echo       INICIANDO SERVIDOR DE CONSUMO ELECTRICO
echo ==========================================================
echo.
cd /d "c:\Nuevo Calculo de Consumo electrico\Calculo"
echo [1/2] Abriendo navegador en http://localhost:3005 ...
start http://localhost:3005
echo [2/2] Lanzando servidor Node.js...
echo.
node server.js
if %errorlevel% neq 0 (
    echo.
    echo ==========================================================
    echo ERROR: El servidor se ha detenido inesperadamente.
    echo Asegurese de que Node.js esta instalado y el puerto 3005 libre.
    echo ==========================================================
)
pause
