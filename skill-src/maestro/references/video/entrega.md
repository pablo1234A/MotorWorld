# Especificaciones de entrega por plataforma

| Plataforma | Formato | Resolución | Duración ideal | Notas |
|---|---|---|---|---|
| TikTok / Reels / Shorts | 9:16 | 1080×1920, 30 fps | 15–45 s | Zona segura: evita 250 px abajo, 150 arriba, 120 a la derecha |
| Feed Instagram / Facebook | 4:5 | 1080×1350 | 15–60 s | Más superficie que 1:1 en el móvil |
| YouTube | 16:9 | 1920×1080 o 3840×2160, 24/30/60 fps | 8–15 min | Miniatura 1280×720, < 2 MB, texto de ≤ 4 palabras |
| LinkedIn | 1:1 o 4:5 | 1080×1080 / 1080×1350 | 30–90 s | Subtítulos siempre |
| X | 16:9 o 1:1 | 1920×1080 / 1080×1080 | < 45 s | |
| Web (hero en bucle) | 16:9 | 1920×1080, sin audio | 6–15 s | MP4 H.264 < 3 MB + póster JPG; `muted playsinline autoplay loop` |
| Anuncio TV / cine | 16:9 | 1920×1080 / DCP | 20/30 s | −23 LUFS (EBU R128), entrega ProRes 422 HQ |

## Ajustes de exportación recomendados
- **Máster**: H.264 alta calidad (`-crf 16 -preset slow`) o ProRes 422 HQ para archivo.
- **Redes**: H.264, perfil High, `yuv420p`, 30 fps, 10–16 Mbps a 1080p, audio AAC 48 kHz 192–320 kbps, −16 LUFS (−14 en YouTube).
- **Web**: H.264 `-crf 23–26` + `-movflags +faststart`; opcional AV1/WebM como primera fuente.
- Comprueba siempre con `scripts/video.sh info archivo.mp4`.

## Paquete de entrega al cliente
`master_16x9.mp4`, `vertical_9x16.mp4`, `cuadrado_1x1.mp4`, `miniatura.jpg`, `subtitulos.srt`, `musica_licencia.pdf` (prueba de licencia de la música), y textos para la publicación (título, descripción, hashtags).
