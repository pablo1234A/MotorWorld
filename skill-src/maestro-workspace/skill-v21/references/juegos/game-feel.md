# Game feel: valores exactos para que todo "pegue"

Regla: **cada acción del jugador → respuesta visual + sonora + (si encaja) cámara, en el mismo frame**. Exagera primero y luego baja hasta que se note sin molestar.

## Catálogo con valores de partida

| Técnica | Valor | Dónde |
|---|---|---|
| Hit-stop (congelar al impactar) | 30–80 ms (golpes fuertes 100 ms) | Melee, jefes, bajas finales |
| Sacudida de cámara | modelo de "trauma" (abajo) | Explosiones, daño, disparos fuertes |
| Patada de cámara | 0,5–2° en la dirección del disparo | Armas |
| Squash & stretch | escala 1,2 / 0,8 durante 80–120 ms | Saltos, aterrizajes, rebotes |
| Destello al recibir daño | blanco 50–80 ms | Enemigos y jugador |
| Partículas | 8–30 por impacto, vida 0,2–0,6 s | Impactos, muertes, recogidas |
| Cámara lenta | 0,3× durante 0,3–0,6 s | Última baja de la oleada |
| Números flotantes | suben 30 px y se desvanecen en 0,6 s | Daño, puntos |
| Tono aleatorio en sonidos | ±5–8 % | Todos los sonidos repetidos |
| Vibración (mando) | 40–120 ms, intensidad según golpe | Disparo, daño |

## Sacudida de cámara por trauma (la buena)

```js
let trauma = 0;                       // 0..1; súmale 0.2–0.6 por evento
function addTrauma(t) { trauma = Math.min(1, trauma + t); }
function shake(camera, time, dt) {
  const s = trauma * trauma;          // cuadrático: pequeños golpes casi no se notan, grandes sí
  camera.rotation.z += 0.05 * s * noise(time * 25, 1);
  camera.rotation.x += 0.03 * s * noise(time * 25, 2);
  camera.rotation.y += 0.03 * s * noise(time * 25, 3);
  trauma = Math.max(0, trauma - 1.5 * dt);
}
// noise: ruido suave (Perlin/Simplex) o suma de senos; nunca Math.random() puro (tiembla feo).
const noise = (t, seed) => Math.sin(t * 1.3 + seed * 17) * 0.6 + Math.sin(t * 2.7 + seed * 5) * 0.4;
```
Ofrece "reducir movimiento de cámara" en ajustes.

## Muelles (para todo lo que vuelve a su sitio)

```js
// Muelle crítico-amortiguado: x tiende a target sin oscilar demasiado
function spring(state, target, stiffness, damping, dt) {
  const a = (target - state.x) * stiffness - state.v * damping;
  state.v += a * dt; state.x += state.v * dt;
}
// Retroceso de arma: stiffness 300, damping 25. Cámara al aterrizar: 120 / 18.
```

## Por género

- **Plataformas**: coyote time 0,1 s, salto en búfer 0,12 s, altura variable (soltar = cortar velocidad vertical ×0,5), gravedad mayor al caer (×1,6), "apex hang" (gravedad ×0,5 cerca del punto más alto), corrección de esquinas de 4–6 px.
- **Carreras**: FOV +10° con la velocidad, cámara con retraso (lerp 4–6/s), desenfoque radial a alta velocidad, sacudida con baches, derrape con más agarre del realista, chispas y humo, sonido del motor por tono según RPM.
- **Top-down / bullet hell**: hitbox del jugador más pequeña que el sprite, balas enemigas de alto contraste, retroceso empujando al jugador.
- **Melee**: anticipación (3–6 frames), golpe (1–3 frames), recuperación; hit-stop en impacto; empuje del enemigo.

## Interfaz de juego
Botones que crecen al pasar el ratón (1,05) y se hunden al pulsar (0,95), sonido de clic suave, transiciones de menú de 150–250 ms, nunca más de 300 ms entre pulsar "Jugar" y estar jugando.
