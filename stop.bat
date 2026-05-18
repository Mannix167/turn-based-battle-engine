@echo off
title Stop Game Servers

echo ========================================
echo   Stop Game Servers
echo ========================================
echo.

echo Stopping backend (port 8000)...
taskkill /f /im python.exe 2>nul
if %errorlevel% equ 0 (
    echo Python processes stopped.
) else (
    echo No Python processes found.
)

echo.
echo Stopping frontend (Node.js)...
taskkill /f /im node.exe 2>nul
if %errorlevel% equ 0 (
    echo Node.js processes stopped.
) else (
    echo No Node.js processes found.
)

echo.
echo ========================================
echo   All services stopped.
echo ========================================
echo.
pause
