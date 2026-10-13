# Arquitectura de código para juegos

## Bucle con paso fijo (física estable a cualquier FPS)

```js
const STEP = 1 / 120;           // física a 120 Hz
let acc = 0, last = performance.now();
function frame(now) {
  let dt = Math.min((now - last) / 1000, 0.1); last = now;   // evita saltos tras cambiar de pestaña
  if (!paused) {
    acc += dt * timeScale;                                   // timeScale para cámara lenta / hit-stop
    while (acc >= STEP) { fixedUpdate(STEP); acc -= STEP; }
    update(dt);                                              // cámara, animaciones, UI
  }
  render(acc / STEP);                                        // alpha para interpolar si hace falta
  requestAnimationFrame(frame);
}
```
Juegos sencillos pueden usar paso variable con `dt` limitado a 1/30 s.

## Estados del juego
`LOADING → MENU → PLAYING ⇄ PAUSED → GAME_OVER → PLAYING`. Un objeto por estado con `enter/exit/update`. La UI se muestra según el estado, no con banderas sueltas.

## Entrada
- Capa de **acciones** (`move`, `look`, `fire`, `aim`, `reload`, `jump`) que lee teclado, ratón, táctil y mando. El juego solo consulta acciones → remapeo de teclas y soporte de mando gratis.
- Usa `event.code` (`KeyW`), no `event.key`, para que funcione en teclados AZERTY o con mayúsculas.
- Guarda "pulsado este frame" y "mantenido" por separado (`pressed`, `held`, `released`).

## Organización
- **Datos fuera del código**: armas, enemigos, oleadas y niveles en objetos/JSON. Ajustar el juego = cambiar números.
- **Entidades simples**: objetos con componentes (`transform`, `health`, `ai`, `weapon`) y sistemas que los recorren. Un ECS completo solo si hay miles de entidades.
- **Bus de eventos** (`emit('enemyKilled', {...})`) para desacoplar: el HUD, el sonido y la puntuación escuchan sin que el enemigo los conozca.
- Proyecto web grande: Vite + TypeScript, un módulo por sistema (`input.ts`, `player.ts`, `weapons.ts`, `ai.ts`, `hud.ts`, `audio.ts`, `level.ts`).

## Memoria y rendimiento
- **Pools** para balas, partículas, decals, enemigos y números flotantes: crear al inicio, activar/desactivar.
- Vectores temporales reutilizados (`const _v = new THREE.Vector3()` fuera de las funciones).
- Liberar recursos al cambiar de nivel (`geometry.dispose()`, `material.dispose()`, `texture.dispose()`).

## Carga y guardado
- `THREE.LoadingManager` para barra de progreso; precargar sonidos y modelos antes de "Jugar".
- Guardado en `localStorage` con **versión** (`{v: 2, ...}`) y migración; siempre dentro de `try/catch` (navegación privada).

## Herramientas de desarrollo
- `?debug` en la URL: FPS, número de draw calls (`renderer.info`), estados de IA, colisiones dibujadas.
- `lil-gui` para ajustar velocidad, retroceso, precisión enemiga en vivo.
- Prueba automática con `scripts/test-juego.mjs` antes de entregar.
- Expón un objeto `window.__game` con estado legible (vida, munición, enemigos, estado) para los tests. No afecta al jugador y permite verificar el juego de forma barata.
