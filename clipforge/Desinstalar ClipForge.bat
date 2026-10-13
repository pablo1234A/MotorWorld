@echo off
chcp 65001 >nul
echo  Se borrara el entorno de Python de ClipForge (%LOCALAPPDATA%\ClipForge).
echo  Tus clips guardados en Chrome no se tocan (se borran desde Ajustes en la app).
pause
rmdir /s /q "%LOCALAPPDATA%\ClipForge"
echo  Hecho.
pause
