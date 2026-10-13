@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul || (
  echo Instalando Python...
  winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
  echo Cierra esta ventana y vuelve a abrir "Iniciar ClipForge.bat".
  pause & exit /b
)
where ffmpeg >nul 2>nul || winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
python -m pip install -q --upgrade yt-dlp
python clipforge_helper.py
pause
