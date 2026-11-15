# Informe de calidad — final_1080x1920.mp4

## Controles técnicos (medidos)
| Control | Resultado | Estado |
|---|---|---|
| Resolución / fps | 1080 × 1920, 30 fps, H.264 yuv420p | OK |
| Duración | 60,56 s | OK (objetivo: 45–65 s) |
| Audio | AAC 192 kbps, 48 kHz, estéreo | OK |
| Sonoridad integrada | −14,2 LUFS (EBU R128) | OK (objetivo de redes: −14) |
| Pico real | −1,4 dBFS | OK (sin clipping) |
| Decodificación completa | `ffmpeg -v error -f null` sin errores | OK |
| Inteligibilidad de la voz | Transcripción automática (Whisper *small*) del MP4 final: ver `asr_transcripcion_whisper.txt` | OK: reconoce el texto casi completo pese a la música |

## Diferencias de la transcripción automática
- «rodas» en lugar de «ruedas» y «recorre» en lugar de «recorres»: son errores leves del reconocedor o de la pronunciación de la voz sintética. El significado se mantiene.
- «90 y 3» en lugar de «93»: es solo cómo el reconocedor escribe el número. La voz dice «noventa y tres».
- Corrección aplicada: la frase «…a cuatrocientos diecinueve en cuatro años» sonaba pegada («4194 años»). Se añadió una pausa («…diecinueve, en solo cuatro años») y se regeneró solo esa frase.

## Controles visuales (hojas de contactos cada 2 s y fotogramas clave)
| Control | Estado |
|---|---|
| Subtítulos dentro de la zona segura (y ≈ 520 px, ancho máx. 860 px, ≤ 2 líneas) | OK |
| Palabra activa resaltada; cifras en número con fondo rojo | OK |
| Rótulos sin solapes (corregidos: velocímetro sobre la cabeza del piloto, señal sobre «6–25 km/h», cifra de 2024 sobre el título del gráfico) | OK tras la corrección |
| Sincronía de la animación con la voz: aguja cae en «frena», regla de 7 m en «siete», 14 m en «catorce», vuelco en «caída», barras en cada cifra, sello en «obligatorio», gran 25 en «Veinticinco» | OK (los tiempos salen de `timeline.json`) |
| Continuidad del piloto (silueta, patinete, faro y piloto rojo; casco en el cierre) | OK |
| Ortografía de rótulos y fuentes en pantalla | Revisado |
| Datos: cada cifra comprobada en el BOE o en la DGT (`00_brief/fuentes.md`); porcentaje exacto «+62,5 %» | OK |

## Limitaciones honestas
- **Animación**: animación programática 2.5D (Canvas 2D vectorial con *rigs* articulados y cámara), no vídeo generado por IA. Los personajes se mueven de verdad (ciclo de caminar, inclinación, señalar, caída), pero su complejidad es menor que la de una animación 3D de la referencia.
- **Voz**: Piper TTS local (`es_ES-davefx-medium`). Es clara y es la misma en todo el vídeo, pero es una voz sintética de calidad media; una voz premium (por ejemplo ElevenLabs) sonaría más natural. Para cambiarla, se sustituyen los WAV de `05_audio/voice/` y se vuelve a ejecutar el pipeline.
- **Música y efectos**: sintetizados desde cero en Python (sin muestras ni licencias de terceros). Funcionales y sincronizados, pero más simples que una banda sonora de librería.
- **Escucha humana**: la mezcla se validó con medidores y con reconocimiento automático de voz, no con una escucha humana. Se recomienda revisarla con auriculares antes de publicar.
