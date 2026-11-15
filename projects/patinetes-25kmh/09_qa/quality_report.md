# Informe de calidad — final_1080x1920.mp4

## Controles técnicos (medidos)
| Control | Resultado | Estado |
|---|---|---|
| Resolución / fps | 1080 × 1920, 30 fps, H.264 yuv420p | OK |
| Duración | 75,7 s | OK (más largo que la v1 por los 4 remates de humor) |
| Audio | AAC 192 kbps, 48 kHz, estéreo | OK |
| Sonoridad integrada | −14,0 LUFS (EBU R128) | OK (objetivo de redes: −14) |
| Pico real | −1,2 dBFS | OK (sin clipping) |
| Decodificación completa | `ffmpeg -v error -f null` sin errores | OK |
| Inteligibilidad de la voz | Transcripción automática (Whisper *small*) del MP4 final: ver `asr_transcripcion_whisper.txt` | OK: reconoce el texto casi completo pese a la música |

## Versión 3: voz de narrador al estilo de la referencia
- La voz **no es un clon** del narrador de `referencia_estilo.mp4`: es una voz original creada a partir de la voz CC0 «davefx», ajustada para parecerse a su **estilo** medido (voz grave de hombre, ≈106 Hz; ritmo rápido, 3,4 pal/s; entonación muy expresiva).
- Resultado: ≈110 Hz, 3,18 palabras/s y expresividad alta (exaggeration 0,8; 0,95 en los remates). Rubberband con tempo ×1,18 y tono −1,5 semitonos, conservando los formantes.
- «DGT» se dice «Tráfico» en la narración, como en el habla coloquial, porque la voz no pronunciaba bien las siglas. En pantalla, las fuentes siguen citando a la DGT.
- Efectos de los remates (confeti, notificaciones, ding) colocados después de la palabra clave para no tapar la voz.
- 214/215 palabras alineadas con Whisper. La transcripción del vídeo final coincide con el guion. En el vídeo completo Whisper confundió «Tráfico odie la diversión», pero ese fragmento por separado se transcribe bien: era un error del reconocedor con audio largo, no de la mezcla.

## Versión 2: voz realista y humor
- **Voz**: Chatterbox multilingüe (Resemble AI, MIT, local en CPU), con timbre de referencia de la voz castellana CC0 «davefx». Se generan 3 tomas por frase y se elige automáticamente la que Whisper transcribe igual que el guion y tiene un ritmo natural (`05_audio/voice/takes_report.json`): las 19 frases elegidas tienen una similitud de 1,00. Se aplica un tempo ×1,10 que conserva el tono.
- **Siglas**: «DGT» se pronuncia «De Ge Te» (antes se leía «dega todo»).
- **Artefactos**: se recortaron colas de ruido o respiración de hasta 4 s tras la última palabra, usando la alineación de Whisper.
- **Subtítulos**: se sincronizan palabra a palabra con Whisper (`tools/align.py`): 217/217 palabras alineadas, en lugar del reparto proporcional.
- **Humor**: 4 remates (DGT y diversión, la asignatura de la ESO, el vídeo viral y «de una pieza»). Cada uno va con un gag visual y un efecto de sonido. La ley, el peatón y los datos de la DGT se mantienen serios, y «Pero esto no es solo un meme» marca el paso al tono serio.
- Transcripción del vídeo final: ver `asr_transcripcion_whisper.txt`. Solo hay diferencias de grafía del reconocedor («de GT», «odia»).

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
- **Voz**: es neuronal y mucho más natural que Piper, pero sigue siendo sintética. El acento castellano procede de la voz de referencia y no se ha comprobado con una escucha humana. Una voz premium (por ejemplo ElevenLabs) o un locutor real sonarían todavía mejor. Para cambiarla, se sustituyen los WAV de `05_audio/voice/` y se vuelve a ejecutar el pipeline.
- **Música y efectos**: sintetizados desde cero en Python (sin muestras ni licencias de terceros). Funcionales y sincronizados, pero más simples que una banda sonora de librería.
- **Escucha humana**: la mezcla se validó con medidores y con reconocimiento automático de voz, no con una escucha humana. Se recomienda revisarla con auriculares antes de publicar.
