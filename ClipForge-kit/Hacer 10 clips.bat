@echo off
chcp 65001 >nul
cd /d "%~dp0"
where ffmpeg >nul 2>nul || winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
python -m pip install -q --upgrade yt-dlp
python hacer_clips.py "https://youtu.be/QBP8Nmx_m6Q" --clips 10 --duracion 30
echo.
echo Los clips estan en la carpeta "clips".
start "" clips
pause
