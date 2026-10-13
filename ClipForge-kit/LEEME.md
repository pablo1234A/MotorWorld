# ClipForge: kit para usarlo en tu ordenador

YouTube no deja que una página web descargue vídeos por sí sola. Este kit
añade el **ayudante local** que `ClipForge-AI.html` necesita, y un atajo para
sacar los 10 clips de 30 s de una vez.

## Opción rápida: 10 clips en un clic (Windows)
Doble clic en **`Hacer 10 clips.bat`**. Descarga https://youtu.be/QBP8Nmx_m6Q,
analiza el audio para encontrar los 10 momentos más intensos (sin repetir
tramos) y los exporta en vertical 9:16 (1080×1920) a la carpeta `clips/`, con
un `indice.txt` que dice de qué minuto sale cada clip.

En Mac: `./iniciar_mac.sh clips`

Otras opciones del script:
```
python hacer_clips.py "ENLACE" --clips 10 --duracion 30 --formato horizontal
python hacer_clips.py mi_video.mp4 --clips 5 --duracion 45
```

## Opción con la interfaz de ClipForge
1. Doble clic en **`Iniciar ClipForge.bat`** (Mac: `./iniciar_mac.sh`).
   La primera vez instala Python, FFmpeg y yt-dlp si faltan.
2. Se abre ClipForge en http://127.0.0.1:8765 con el ayudante conectado.
3. Pega el enlace, elige 10 clips de 30 s y genera.

Si YouTube dice "verificación anti-bot", ejecuta `Actualizar ClipForge.bat`.
Úsalo solo con vídeos que tengas derecho a reutilizar.
