@echo off
title Meluko Manasa - Podcast Studio
color 5F
cls

echo.
echo  =====================================================
echo     MELUKO MANASA - TELUGU STOIC PODCAST STUDIO
echo     Stoicism  .  Wisdom  .  Mental Strength
echo  =====================================================
echo.
echo  Starting your podcast production studio...
echo.

cd /d "%~dp0"

if not exist ".env" (
    echo  [WARNING] .env file not found!
    echo  Please create .env file with GEMINI_API_KEY=your_key
    echo  See .env.example for reference.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo  Installing dependencies - please wait a moment...
    call npm install --silent
    if errorlevel 1 (
        echo  [ERROR] npm install failed. Make sure Node.js is installed.
        pause
        exit /b 1
    )
    echo  Dependencies installed!
    echo.
)

echo  Starting backend server on port 3001...
start "MM-Backend-Server" /min cmd /c "node server/index.js"

echo  Waiting for server to initialize...
timeout /t 4 /nobreak > nul

echo  Opening Podcast Studio in browser...
start "" "http://localhost:3001"

echo.
echo  =====================================================
echo   Studio is LIVE at: http://localhost:3001
echo   Backend: Running in minimized window
echo   Close this window to stop the server
echo  =====================================================
echo.
pause > nul

taskkill /fi "WindowTitle eq MM-Backend-Server*" /f > nul 2>&1
exit
