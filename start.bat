@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo First run detected, setting up ...
    call setup.bat
    if not exist ".venv\Scripts\python.exe" exit /b 1
)

echo Starting offline translator on http://127.0.0.1:8765
echo Keep this window open while using the browser extension.
echo Press Ctrl+C to stop.
echo.
cd server
..\.venv\Scripts\python.exe app.py --port 8765 --warmup
pause
