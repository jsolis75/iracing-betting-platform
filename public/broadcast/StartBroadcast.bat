@echo off
title iRacing Telemetry Broadcaster
color 0A

echo ========================================================
echo       iRacing Betting Platform - Broadcast Tool
echo ========================================================
echo.

:: Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python is not installed.
    echo.
    echo Would you like to auto-install Python now? (Y/N)
    set /p install_python=
    if /i "%install_python%"=="Y" (
        echo [INFO] Installing Python via winget...
        winget install Python.Python.3.12
        echo [INFO] Python installed! Please restart this script.
        pause
        exit
    ) else (
        echo [INFO] Please install Python manually from https://www.python.org/downloads/
        echo Make sure to check "Add Python to PATH" during installation!
        pause
        exit
    )
)

echo [OK] Python found!
echo.

:: Download broadcast.py if missing
if not exist broadcast.py (
    echo [INFO] Downloading broadcaster script...
    curl -s -o broadcast.py https://iracing-betting-platform.vercel.app/broadcast/broadcast.py
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to download. Check your internet connection.
        pause
        exit
    )
)

:: Install dependencies quietly
echo [INFO] Installing dependencies (irsdk, requests)...
pip install --quiet irsdk requests
echo [OK] Dependencies ready!
echo.
echo ========================================================
echo Starting broadcaster... (Keep this window open!)
echo ========================================================
echo.

python broadcast.py

echo.
echo [INFO] Broadcaster stopped.
pause
