@echo off
title iRacing Broadcaster
color 0A

echo ========================================================
echo       iRacing Betting Platform - Broadcaster
echo ========================================================
echo.

:: Try to run the exe first
if exist iracing-broadcast.exe (
    echo [INFO] Running broadcaster...
    echo.
    iracing-broadcast.exe
    echo.
    echo [INFO] Broadcaster closed.
    echo.
    goto :end
)

echo [ERROR] iracing-broadcast.exe not found in this folder.
echo.

:end
echo.
echo Press any key to close this window...
pause >nul
