# Vídeo con IA generativa: producción consistente

El problema de la IA no es la calidad de un clip, es la **coherencia** entre clips. Se resuelve con un sistema.

## 1. Biblia visual (antes de generar nada)
Un bloque de texto fijo que se pega al final de **todos** los prompts:
```
ESTILO: fotografía cinematográfica, lente anamórfica 40 mm, grano de película fino, luz de atardecer cálida desde la izquierda,
sombras azuladas, paleta naranja quemado / azul petróleo / negro, contraste medio, profundidad de campo reducida, 24 fps.
```
Más: **hoja de personaje** (descripción física exacta + 3 imágenes de referencia de frente, perfil y cuerpo entero) y **hoja de lugar**.

## 2. Imagen primero, luego vídeo (image-to-video)
1. Genera el fotograma inicial de cada plano con un modelo de imagen (Midjourney, Flux, GPT Image, Imagen, Ideogram) usando la biblia + referencias de personaje.
2. Anímalo con image-to-video (Veo, Kling, Runway, Seedance, Higgsfield, Sora): el prompt de vídeo describe **solo el movimiento** (de la cámara y del sujeto), no repite la escena.
3. Para continuidad entre planos: usa el último fotograma de un clip como primer fotograma del siguiente (o modos de fotograma inicial + final).

## 3. Prompt de vídeo
```
[Movimiento de cámara] + [acción del sujeto, una sola] + [ritmo] + [duración]
"Dolly in lento hacia el mecánico, que gira la llave y levanta la mirada a cámara; movimiento suave y continuo; 5 s."
```
- Un movimiento de cámara por clip: dolly in/out, travelling lateral, órbita 90°, grúa ascendente, cámara en mano sutil, FPV.
- Evita: varias acciones a la vez, manos haciendo tareas finas, texto en pantalla (añádelo en edición), multitudes.
- Genera 3–4 variantes por plano y elige; es más barato que pelear con un solo intento.

## 4. Postproducción de clips IA
- Escalado a 4K (Topaz Video AI, o el escalador de la herramienta), interpolación a 48/60 fps si hace falta.
- Igualar color entre clips en DaVinci (los modelos varían el tono).
- **Sonido propio**: la IA rara vez da audio usable → ambiente, efectos y música en edición. Voz con ElevenLabs (clonada con permiso) o locutor.
- Montaje con las reglas de `edicion.md`.

## 5. Ética y derechos
No generes personas reales identificables sin permiso, ni marcas o logotipos ajenos. Revisa los términos comerciales de cada herramienta. Si el cliente lo publica, indica que hay contenido generado con IA donde la plataforma lo exija.

## 6. Plantilla de plan de producción IA
| Plano | Imagen inicial (prompt + referencia) | Movimiento (prompt de vídeo) | Herramienta | Duración | Variantes | Elegida |
|---|---|---|---|---|---|---|
