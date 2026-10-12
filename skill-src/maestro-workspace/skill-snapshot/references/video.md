# Vídeo, edición y motion graphics

Claude no "ve" ni renderiza vídeo por sí solo: su potencia está en **guion, estructura, código que genera vídeo (Remotion, ffmpeg, After Effects scripts) y planes de edición precisos** que tú o tus herramientas ejecutáis.

## Guion que retiene
- **Gancho en 0–3 s**: pregunta, resultado final primero, afirmación sorprendente o movimiento.
- Estructura: gancho → promesa → contenido en bloques cortos con micro-ganchos cada 15–30 s → payoff → CTA.
- Escribe para el oído: frases cortas, una idea por plano.
- Formato de entrega: tabla `tiempo | plano/visual | texto en pantalla | locución | audio/SFX`.

## Edición
- Ritmo: cortes cada 2–4 s en redes; J-cuts y L-cuts para fluidez; cortar en el movimiento.
- Subtítulos grandes, 2–4 palabras por bloque, palabra clave resaltada, zona segura (evitar el 15 % inferior y lateral derecho en TikTok/Reels).
- Audio > imagen: voz limpia (-16 LUFS redes, -14 YouTube), música con ducking bajo la voz, SFX en transiciones.
- Color: corrección (balance, exposición) antes que gradación (look). LUT con intensidad 50–70 %.
- Formatos: 9:16 1080×1920 (Reels/TikTok/Shorts), 16:9 1920×1080 o 4K (YouTube), 1:1 / 4:5 (feed).

## Vídeo con código
- **Remotion** (React → MP4): ideal para vídeos con datos, plantillas, subtítulos animados, intros de marca. `npx create-video@latest`, componentes con `useCurrentFrame()` + `interpolate()`/`spring()`.
- **ffmpeg** (recetas):
  - Recortar sin recodificar: `ffmpeg -ss 00:00:05 -to 00:00:20 -i in.mp4 -c copy out.mp4`
  - Vertical 9:16 con fondo desenfocado: `ffmpeg -i in.mp4 -vf "split[a][b];[a]scale=1080:1920,boxblur=20[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2" out.mp4`
  - Quemar subtítulos: `ffmpeg -i in.mp4 -vf subtitles=subs.srt out.mp4`
  - Normalizar audio: `ffmpeg -i in.mp4 -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:v copy out.mp4`
  - Web ligero: `ffmpeg -i in.mp4 -c:v libx264 -crf 23 -preset slow -movflags +faststart -an hero.mp4`
  - Para scroll-scrub: `-g 1` (keyframe en cada frame).
- **Transcripción/subtítulos**: Whisper (local) → SRT → revisar → quemar o subir.
- **IA generativa de vídeo** (Runway, Kling, Veo, Seedance, Higgsfield): prompt = sujeto + acción + cámara (dolly in, orbit, crane) + luz + estilo + duración. Mantén coherencia con imagen de referencia inicial y final.

## Motion graphics
Principios de animación (anticipación, easing, superposición), tipografía cinética sincronizada al beat, máximo 2 fuentes, paleta de 3–4 colores, transiciones con propósito.
