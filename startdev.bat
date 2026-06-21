@echo off
title Meluko Manasa - Podcast Studio Launcher
color 5F
cls

echo.
echo  =====================================================
echo     MELUKO MANASA - TELUGU STOIC PODCAST STUDIO
echo     Stoicism  .  Wisdom  .  Mental Strength
echo  =====================================================
echo.

:: Change to folder where this bat file lives
cd /d "%~dp0"

:: Check Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js is NOT installed!
    echo  Please download from: https://nodejs.org
    pause
    exit /b 1
)

:: Check .env exists
if not exist ".env" (
    echo  [ERROR] .env file not found!
    echo  Please create .env with your OPENAI_API_KEY.
    echo  Example: OPENAI_API_KEY=sk-proj-xxxxx
    echo.
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo  Installing dependencies - please wait...
    call npm install
    if errorlevel 1 (
        echo  [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo.
    echo  Dependencies installed successfully!
    echo.
)

:: Start backend server in a VISIBLE window (so you can see errors)
echo  Starting backend server...
start "Meluko Manasa - Backend Server" cmd /k "cd /d %~dp0 && node server/index.js"

:: Wait for server to be ready
echo  Waiting for server to start (5 seconds)...
timeout /t 5 /nobreak >nul

:: Open browser
echo  Opening Studio in browser...
start "" "http://localhost:3001"

echo.
echo  =====================================================
echo    Studio LIVE at: http://localhost:3001
echo    Server running in separate window
echo    Close the Server window to stop
echo  =====================================================
echo.
echo  Press any key to close this launcher...
pause >nul
exit
