# Edición profesional: montaje, sonido y color

## Montaje
- **Ritmo**: redes 1,5–3 s por plano; YouTube 3–6 s; marca/cine 4–8 s. Cambia algo (plano, zoom, texto, b-roll) cada 2–4 s en vertical.
- **Cortar en el movimiento** (la acción oculta el corte). **J-cut**: el audio del siguiente plano entra antes que la imagen; **L-cut**: el audio sigue sobre el plano siguiente. Dan fluidez a entrevistas.
- **Cortes al beat** de la música en los momentos de energía; no en todos (cansa).
- **Jump cuts** en hablando a cámara: quita silencios y muletillas; alterna encuadre 100 % / 115 % para disimular.
- Zooms digitales suaves (105–115 %) con easing para enfatizar; nunca más del 130 % en 4K→1080 o se pixela.
- Transiciones: el corte seco es la norma. Usa transiciones con motivo (whip pan, match cut, máscara con objeto que pasa).

## Sonido (lo que más delata lo amateur)
1. **Limpieza de voz**: reducción de ruido suave (DaVinci *Voice Isolation* al 50–70 %, Adobe Podcast Enhance, o `afftdn` en ffmpeg), filtro paso alto a 80 Hz, de-esser 5–8 kHz.
2. **Ecualización de voz**: −2/−3 dB en 200–400 Hz (barro), +2 dB en 3–5 kHz (presencia), aire suave en 10–12 kHz.
3. **Compresión**: ratio 3:1, ataque 10 ms, liberación 100 ms, 3–6 dB de reducción.
4. **Música**: ducking automático bajo la voz (−12 a −18 dB mientras se habla); cortes de música en el silencio de la voz.
5. **Diseño sonoro**: whoosh en transiciones, impactos en textos que entran, risers antes de una revelación, ambiente de fondo bajo para que no haya silencio digital.
6. **Masterización**: −16 LUFS integrados (redes), −14 (YouTube), −23 (TV, EBU R128), pico verdadero ≤ −1 dBTP. Con ffmpeg: `scripts/video.sh audio entrada.mp4`.

## Color (orden de los nodos en DaVinci Resolve)
1. **Gestión de color**: si es LOG (S-Log3, V-Log, Apple Log), convierte con Color Space Transform a Rec.709 / Gamma 2.4 (o Rec.709-A para web en Mac).
2. **Corrección primaria** por plano: exposición, balance de blancos (pipeta en algo neutro), contraste; el vectorscopio con la piel en la línea de tono de piel.
3. **Igualar planos** de la misma escena (mismo tono y brillo).
4. **Secundarias**: cielos, piel, el producto (máscaras con seguimiento).
5. **Look** al final, con intensidad 40–70 %: teal & orange suave, película cálida, desaturado frío. Mismo look en todo el vídeo.
6. **Acabado**: viñeta suave, grano de película fino (0,5–1 %), nitidez mínima.

## Subtítulos que retienen
- Generar con Whisper (`scripts/video.sh subs entrada.mp4` crea un SRT si `whisper` está instalado) y revisar a mano nombres y cifras.
- Estilo redes: 2–4 palabras por bloque, fuente gruesa (Montserrat ExtraBold, Inter Black), contorno o sombra, la palabra activa resaltada en color o escala 1,1. Animación palabra a palabra: `examples/remotion-subtitulos.tsx`.
- Posición: centro-bajo pero por encima del 20 % inferior (botones de TikTok/Reels) y fuera del 15 % derecho.

## Motion graphics
- Textos que entran con máscara (de abajo arriba) en 8–12 frames con ease-out; salen en 6–8.
- Máximo 2 fuentes y 3–4 colores de marca. Todo animado con la misma curva de easing.
- Llamadas de atención (flechas, círculos) dibujándose en 10–15 frames, no apareciendo de golpe.
- Herramientas: After Effects, DaVinci Fusion, CapCut (rápido), **Remotion** (por código, repetible: `remotion.md`).

## Plan de edición para un editor humano (lo que Claude entrega)
Tabla con: tiempo de entrada/salida del clip original, plano, texto en pantalla, efecto, sonido, nota de color. Un editor ejecuta un plan así en una fracción del tiempo.
