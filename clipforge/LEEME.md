# ClipForge AI

Convierte vídeos largos en clips verticales para TikTok, Reels y Shorts. Todo el proceso ocurre en tu equipo: transcripción con IA, selección de momentos, reencuadre, subtítulos animados y exportación a MP4. No hay cuotas, créditos ni suscripciones.

## Uso rápido (sin instalar nada)

1. Descarga la carpeta `clipforge` (o solo `ClipForge-AI.html`).
2. Abre `ClipForge-AI.html` con **Google Chrome** (doble clic o arrástralo a Chrome).
3. Ve a la pestaña **Archivo de vídeo**, elige tu vídeo, la duración y el número de clips.
4. Pulsa **GENERAR CLIPS AUTOMÁTICAMENTE**.
5. Revisa los clips, ajústalos si quieres y descárgalos en MP4 o en un ZIP.

La primera vez, Chrome descarga el motor de IA (Whisper, entre 75 y 480 MB según el modelo). Después queda en caché y funciona sin conexión.

## Pegar enlaces de YouTube (ayudante local opcional)

Chrome no permite que una página web descargue vídeos de YouTube por sí misma. Para pegar enlaces directamente:

1. Haz doble clic en **`Iniciar ClipForge.bat`**.
   - La primera vez instala Python (con winget, si falta), yt-dlp, FFmpeg y deno en `%LOCALAPPDATA%\ClipForge`. Tarda de 1 a 3 minutos y solo ocurre una vez.
2. Se abrirá ClipForge en `http://127.0.0.1:8765` con la descarga de YouTube activa.
3. Deja abierta la ventana negra mientras uses la aplicación.

- **`Actualizar ClipForge.bat`**: actualiza yt-dlp (útil si YouTube cambia algo y las descargas fallan).
- **`Desinstalar ClipForge.bat`**: borra el entorno instalado.

El ayudante solo escucha en tu equipo (127.0.0.1), solo acepta enlaces de vídeos de YouTube y no usa tus cuentas ni cookies. Los vídeos privados, con restricción de edad, solo para miembros, con DRM o en directo no se procesan, y la aplicación te dice el motivo. Úsalo solo con contenido que tengas derecho a reutilizar.

> Nota: las páginas abiertas como archivo (`file://`) y las abiertas desde `http://127.0.0.1:8765` guardan su biblioteca por separado en Chrome.

## Qué hace cada fase

| Fase | Cómo funciona |
|---|---|
| Transcripción | Whisper (transformers.js) en un Web Worker, con WebGPU si está disponible o CPU en caso contrario. Da marcas de tiempo por palabra y se salta el silencio para evitar textos inventados. También puedes importar tus propios SRT o VTT. |
| Momentos | Se puntúan ventanas formadas por frases completas según 8 factores: fuerza del inicio, claridad narrativa, interés, desarrollo, autonomía, retención, calidad técnica y ausencia de cortes bruscos. Se descartan los solapamientos y los duplicados. Si no hay suficientes momentos buenos, se entregan menos clips. |
| Encuadre | MediaPipe detecta rostros. La cámara sigue al rostro principal con una zona muerta y suavizado, sin cambiar de persona de forma nerviosa y con corte limpio en los cambios de plano. Si recortar perdería demasiada imagen, se usa el vídeo completo sobre un fondo desenfocado. |
| Subtítulos | Hay 5 estilos: Elegante, Impacto, Píldora, Karaoke y Minimal. Muestran como máximo 2 líneas, resaltan la palabra activa y las palabras clave, respetan las zonas seguras de TikTok y se apartan del rostro. |
| Audio | Filtro paso alto, atenuación suave del ruido entre frases, compresión ligera, nivelado de voz y limitador. No se añade música ni efectos de sonido. |
| Exportación | Se graba en tiempo real a 1080×1920 (o 720p) en MP4 H.264/AAC con Chrome 126 o posterior. Los silencios largos se recortan sin cortar palabras. |

## Requisitos

- Google Chrome actualizado, en Windows, macOS o Linux.
- 8 GB de RAM recomendados. Con una GPU compatible con WebGPU, la transcripción es mucho más rápida.
- Mantén la pestaña visible mientras se exportan los clips. Si cambias de pestaña, la exportación se pausa y continúa al volver.
- Hay un límite de 4 GB por vídeo. El audio se decodifica completo en memoria, así que los vídeos de varias horas necesitan bastante RAM.

## Privacidad

Los vídeos, transcripciones y clips se guardan en el almacenamiento interno de Chrome (IndexedDB) y nunca se suben a ningún servidor. Desde **Ajustes** puedes borrar los vídeos de origen o todos los datos.
