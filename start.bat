@echo off
title Turn-Based Grid Game

echo ========================================
echo   Turn-Based Grid Game v2
echo ========================================
echo.

cd /d "%~dp0"

netstat -ano | findstr ":8000.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo Backend already running on port 8000
) else (
    echo Starting backend on port 8000...
    start "Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
    ping 127.0.0.1 -n 4 >nul
)

netstat -ano | findstr ":5173.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo Frontend already running on port 5173
) else (
    echo Starting frontend on port 5173...
    start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
    ping 127.0.0.1 -n 5 >nul
)

echo.
echo Opening browser...
start "" http://127.0.0.1:5173

echo.
echo ========================================
echo   Done!
echo   Frontend:  http://127.0.0.1:5173
echo   Backend:   http://127.0.0.1:8000
echo   API Docs:  http://127.0.0.1:8000/docs
echo ========================================
echo.
pause
