# ¿Por qué tu patinete no pasa de 25? — vídeo vertical

Vídeo narrativo vertical (1080×1920, 73 s) con toques de humor puntuales para TikTok, Reels o Shorts, con estilo de siluetas y escenarios 2.5D nocturnos inspirado en `referencia_estilo.mp4`. Todas las cifras son reales y verificadas (ver `00_brief/fuentes.md`).

**Resultado final:** `08_exports/final_1080x1920.mp4` · miniatura: `08_exports/thumbnail.png` · subtítulos: `06_captions/subtitles.srt`

## Estructura
```
00_brief/        brief, análisis de la referencia, fuentes verificadas
01_script/       narration.json (guion por escenas + cifras para subtítulos), narration.txt
02_storyboard/   scenes.json, storyboard.md, biblias de personajes y escenarios
04_animation/    scene_projects/render.html (motor de animación) · scene_renders/ (vídeo sin audio, regenerable)
05_audio/        voice/ (frases WAV + pista continua) · music/ · sfx/cues.json · mix/
06_captions/     subtitles.srt
07_edit/         timeline.json (tiempos de escena, frase y palabra: la fuente de verdad de la sincronía)
08_exports/      MP4 final + miniatura
09_qa/           informe de calidad, hoja de contactos, transcripción de control
tools/           pipeline reproducible
```

## Pipeline (reanudable)
Requisitos: Python 3 con `piper-tts`, `numpy` y `faster-whisper`; un entorno Python 3.11 con `chatterbox-tts` y `faster-whisper` (y `setuptools<81`); Node con `playwright` (Chromium) y FFmpeg. Los modelos se descargan de Hugging Face (con `HF_HUB_DISABLE_XET=1`).

```bash
cd projects/patinetes-25kmh
python tools/tts_chatterbox.py . 05_audio/voice_reference/ref_davefx_cc0.wav  # (venv 3.11) voz neuronal, mejor de 3 tomas por frase
python3 tools/align.py .                                # alineación palabra a palabra con Whisper
python3 tools/tts.py .                                  # pista de voz continua (tempo ×1,10) → timeline.json
node tools/render.js . cues                             # exporta los cues de sonido desde la animación
node tools/render.js . video                            # renderiza 1080×1920 a 30 fps (~1,5 min)
python3 tools/audio.py .                                # música original + efectos sintetizados
./tools/mix.sh .                                        # mezcla con ducking, −14 LUFS, mux MP4 + miniatura
python3 tools/srt.py .                                  # subtítulos SRT
python3 tools/storyboard.py .                           # scenes.json + storyboard.md
node tools/render.js . stills 12.5 30                   # fotogramas de control en 09_qa/stills
```

**Cambiar una frase:** edita `01_script/narration.json`, borra solo su WAV en `05_audio/voice/` y repite el pipeline. Animación, efectos y subtítulos se resincronizan solos porque leen los tiempos de `timeline.json`.

Los archivos `video_noaudio.mp4`, `music.wav`, `sfx.wav` y `mix.wav` no se versionan porque son grandes y se regeneran de forma determinista con los scripts.
