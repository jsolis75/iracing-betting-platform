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
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit
)

echo [INFO] Python found. Checking dependencies...

:: Install dependencies
pip install irsdk requests >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Failed to install dependencies automatically.
    echo Attempting to run anyway...
) else (
    echo [INFO] Dependencies installed.
)

:: Check for broadcast.py, download if missing
if not exist broadcast.py (
    echo [INFO] broadcast.py not found. Downloading latest version...
    curl -s -o broadcast.py https://iracing-betting-platform.vercel.app/broadcast/broadcast.py
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to download broadcast.py.
        echo Please ensure you are connected to the internet.
        pause
        exit
    )
    echo [INFO] Download complete.
)

echo.
echo [INFO] Starting Broadcaster...
echo.

python broadcast.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Script crashed or closed unexpectedly.
    pause
)
