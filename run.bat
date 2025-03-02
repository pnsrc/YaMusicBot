@echo off
echo Starting Yandex Music Electron...
cd /d "%~dp0"
npm start
if %ERRORLEVEL% neq 0 (
    echo Error occurred while running the application.
    pause
    exit /b %ERRORLEVEL%
)