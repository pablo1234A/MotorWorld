# Vídeo profesional — índice y estándar

Claude no ve ni monta vídeo en una línea de tiempo, pero puede: **escribir guiones y storyboards de nivel agencia, generar vídeo por código (Remotion), procesar y exportar con ffmpeg de forma exacta (`scripts/video.sh`), preparar planes de edición y color que un editor ejecuta en minutos, y dirigir herramientas de IA generativa** con prompts consistentes.

| Necesitas | Lee |
|---|---|
| Guion, gancho, estructura, storyboard | `guion.md` |
| Montaje, ritmo, color, sonido (DaVinci Resolve / Premiere / CapCut) | `edicion.md` |
| Vídeo generado con código: plantillas, subtítulos, datos | `remotion.md` + `examples/remotion-subtitulos.tsx` |
| Recortar, convertir, subtitular, normalizar, exportar | `ffmpeg.md` + `scripts/video.sh` |
| Vídeo con IA (Veo, Kling, Runway, Seedance, Higgsfield, Sora) | `ia-video.md` |
| Formatos y especificaciones de cada plataforma | `entrega.md` |

## Estándar profesional (todo vídeo debe cumplirlo)
- [ ] **Gancho en 0–2 s**: visual en movimiento + texto + promesa. Nada de logos ni "hola" al principio.
- [ ] **Una idea por plano**, cortes con motivo (acción, mirada, beat, cambio de información).
- [ ] **Sonido limpio**: voz a −16 LUFS integrados en redes (−14 YouTube), picos ≤ −1 dBTP, música por debajo de la voz (−18 a −24 dB), sin silencios muertos.
- [ ] **Subtítulos** quemados en redes (85 % se ve sin sonido), 2–4 palabras por bloque, dentro de la zona segura.
- [ ] **Color coherente**: balance y exposición corregidos plano a plano antes del look; tonos de piel naturales.
- [ ] **Formato correcto** para cada plataforma (ver `entrega.md`), sin bandas negras ni barras pixeladas.
- [ ] **Final con acción** concreta (seguir, comprar, comentar una palabra), no un "gracias por ver".
- [ ] Revisado con `scripts/video.sh info` (resolución, fps, códec, volumen) antes de entregar.

## Flujo de trabajo recomendado
1. Brief → objetivo, plataforma, duración, tono, referencia.
2. Guion + storyboard en tabla (`guion.md`).
3. Material: grabación (guía de planos), IA (`ia-video.md`) o generado (`remotion.md`).
4. Montaje en bruto por ritmo de la voz → afinado → sonido → color → subtítulos → exportación.
5. Versiones por plataforma con `scripts/video.sh` (vertical, cuadrado, horizontal, miniatura, GIF).
