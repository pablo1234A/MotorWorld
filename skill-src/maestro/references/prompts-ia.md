# Prompts maestros para IA (Claude, imagen, vídeo)

## Para Claude (texto/código)
```
Rol: <experto concreto>.
Objetivo: <resultado>, para <público>.
Contexto: <datos imprescindibles>.
Restricciones: <stack, tono, longitud>.
Hecho = <criterio verificable>.
Formato: <estructura exacta de la salida>.
Antes de responder, piensa el enfoque; entrega solo el resultado final.
```
Trucos: da 1–2 ejemplos del resultado deseado (few-shot); usa etiquetas XML (`<contexto>…</contexto>`) para separar bloques; pide JSON con esquema cuando lo vaya a leer una máquina.

## Imagen (Midjourney, Flux, GPT Image, Imagen, Ideogram)
Estructura: **sujeto + acción + entorno + composición/encuadre + luz + estilo/medio + paleta + detalles técnicos**.
- Foto producto: "Botella de perfume de cristal ámbar sobre bloque de travertino, luz lateral dura de atardecer, sombras largas, fondo crema liso, fotografía editorial de producto, 85 mm, f/4, minimalista, alta nitidez."
- Hero web: "Vista isométrica de un pequeño taller mecánico en miniatura tipo diorama, materiales mate, luz suave de estudio, paleta naranja quemado y gris pizarra, mucho espacio negativo a la izquierda para texto."
- Evita: "hermoso, increíble, 8k ultra realista" (ruido). Sé físico y concreto.

## Vídeo (Veo, Kling, Runway, Seedance, Higgsfield)
**Plano + sujeto + acción + movimiento de cámara + luz + estilo + duración.**
- "Plano general, un coche deportivo rojo recorre una carretera de montaña al amanecer, dron siguiendo desde atrás y elevándose lentamente, niebla en el valle, look cinematográfico anamórfico, 5 s."
- Para continuidad: usa la última imagen de un clip como primera del siguiente.

## Música/voz (Suno, ElevenLabs)
Género + tempo (BPM) + instrumentos + ánimo + estructura. Voz: describe edad, tono, ritmo y emoción; escribe la puntuación como quieres que se pause.
