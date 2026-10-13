@echo off
setlocal
chcp 65001 >nul
title ClipForge AI - actualizar componentes
set "VENV=%LOCALAPPDATA%\ClipForge\venv"
if not exist "%VENV%\Scripts\python.exe" (
  echo  Todavia no se ha instalado nada. Abre primero "Iniciar ClipForge.bat".
  pause & exit /b 1
)
echo  Actualizando yt-dlp, FFmpeg y deno...
"%VENV%\Scripts\python.exe" -m pip install --disable-pip-version-check -q --upgrade "yt-dlp[default]" imageio-ffmpeg deno
if errorlevel 1 ( echo  No se pudo actualizar. Revisa tu conexion. ) else ( echo  Listo. Ya puedes abrir "Iniciar ClipForge.bat". )
pause
