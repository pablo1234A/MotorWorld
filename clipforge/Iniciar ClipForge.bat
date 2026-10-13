@echo off
setlocal
chcp 65001 >nul
title ClipForge AI - ayudante local
cd /d "%~dp0"
set "VENV=%LOCALAPPDATA%\ClipForge\venv"

if exist "%VENV%\Scripts\python.exe" goto run

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  python -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo.
  echo  No se ha encontrado Python 3.10 o superior.
  echo  Intentando instalarlo con winget...
  echo.
  winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
  echo.
  echo  Si la instalacion ha terminado, cierra esta ventana y vuelve a abrir
  echo  "Iniciar ClipForge.bat". Si winget no esta disponible, instala Python
  echo  desde https://www.python.org/downloads/ marcando "Add python.exe to PATH".
  echo.
  echo  Mientras tanto puedes usar ClipForge-AI.html directamente con archivos locales.
  pause
  exit /b 1
)

echo.
echo  Primera ejecucion: preparando ClipForge (1-3 minutos, solo una vez)...
%PY% -m venv "%VENV%"
if errorlevel 1 ( echo  Error al crear el entorno de Python. & pause & exit /b 1 )
"%VENV%\Scripts\python.exe" -m pip install --disable-pip-version-check -q --upgrade pip
"%VENV%\Scripts\python.exe" -m pip install --disable-pip-version-check -q "yt-dlp[default]" imageio-ffmpeg deno
if errorlevel 1 ( echo  Error al instalar los componentes. Revisa tu conexion. & pause & exit /b 1 )

:run
"%VENV%\Scripts\python.exe" "%~dp0clipforge-helper.py" --open-browser
if errorlevel 1 (
  echo.
  echo  El ayudante se ha detenido con un error. Si el puerto 8765 esta ocupado,
  echo  quiza ClipForge ya esta abierto en otra ventana.
  pause
)
