@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
    where python >nul 2>nul && set "PY=python"
)
if not defined PY (
    echo [X] Python 3.10+ was not found.
    echo     Install it first: https://www.python.org/downloads/
    echo     Remember to tick "Add Python to PATH".
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo [1/3] Creating virtual environment ...
    %PY% -m venv .venv
    if errorlevel 1 (
        echo [X] Failed to create venv.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Virtual environment already exists, skipping.
)

echo [2/3] Installing dependencies ...
".venv\Scripts\python.exe" -m pip install -U pip -q
".venv\Scripts\python.exe" -m pip install -r server\requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
if errorlevel 1 (
    echo [!] Retrying with Tsinghua mirror ...
    ".venv\Scripts\python.exe" -m pip install -r server\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn
)
if errorlevel 1 (
    echo [X] Dependency installation failed. Check your network.
    pause
    exit /b 1
)

echo [3/3] Downloading translation models ^(en ^<^-^> zh, about 200MB, one time^) ...
".venv\Scripts\python.exe" tools\download_models.py en zh

echo.
echo Done. Now double-click start.bat to launch the local service.
pause
