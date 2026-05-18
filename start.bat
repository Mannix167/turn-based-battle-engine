@echo off
chcp 65001
title Turn-Based Grid Game

echo ========================================
echo   Turn-Based Grid Game v2
echo ========================================
echo.

cd /d "%~dp0"

:: 检查端口是否已在运行
netstat -ano | findstr ":8000.*LISTENING" >nul
if %errorlevel% equ 0 (
    echo [提示] 后端已在运行 (端口 8000)
) else (
    echo 启动后端 (端口 8000)...
    start "Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
    ping 127.0.0.1 -n 3 >nul
)

netstat -ano | findstr ":5173.*LISTENING" >nul
if %errorlevel% equ 0 (
    echo [提示] 前端已在运行 (端口 5173)
) else (
    echo 启动前端 (端口 5173)...
    start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
    ping 127.0.0.1 -n 4 >nul
)

echo.
echo 打开浏览器...
start http://127.0.0.1:5173

echo.
echo ========================================
echo   启动完成!
echo   前端: http://127.0.0.1:5173
echo   后端: http://127.0.0.1:8000
echo   API文档: http://127.0.0.1:8000/docs
echo ========================================
echo.
pause
