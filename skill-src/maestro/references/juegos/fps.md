# FPS / shooters: cómo se hace uno que se sienta profesional

Valores de partida probados. Ajusta jugando, pero empieza aquí en vez de inventar.

## Contenido
1. Cámara y movimiento · 2. Armas · 3. Viewmodel · 4. Impacto y feedback · 5. Enemigos · 6. Mapa · 7. HUD · 8. Audio · 9. Móvil y mando · 10. Rendimiento · 11. Librerías

## 1. Cámara y movimiento

| Parámetro | Valor |
|---|---|
| Altura de ojos | 1,65 m (agachado 1,05 m, transición 0,15 s) |
| Andar / correr / agachado | 5 / 7,5 / 2,5 m/s |
| Aceleración en suelo | 12–14 (estilo Quake: acelerar hacia la dirección deseada) |
| Fricción | 8 |
| Control en el aire | 0,3 × aceleración |
| Gravedad / salto | 20 m/s² / 6,5 m/s (más ágil que la física real) |
| Coyote time / salto en búfer | 0,1 s / 0,12 s |
| FOV base / al correr / apuntando | 75° (ajustable 60–100) / +6° / ×0,7 |
| Sensibilidad ratón | 0,0022 rad/píxel por defecto, ajustable |

- Rotación: guardar `yaw` y `pitch` aparte; `pitch` limitado a ±89°. Orden de Euler `'YXZ'`.
- Bob de cabeza: amplitud 0,04 m, frecuencia ligada a la velocidad (≈ 2 pasos/s andando). Sonido de paso en cada ciclo.
- Aterrizaje: hundir la cámara 0,08–0,15 m según la velocidad de caída y recuperar con muelle.
- Colisiones: caja del jugador (0,6 × 1,8 m) contra cajas del nivel, **resolviendo cada eje por separado** (X, luego Z, luego Y). Permite subir encima de cajas y no atravesar paredes. Para niveles con mallas complejas: `three-mesh-bvh` (capsula contra BVH) o Rapier.

```js
// Aceleración tipo Quake (suelo). wish = dirección deseada normalizada, vel = velocidad horizontal
function accelerate(vel, wish, maxSpeed, accel, dt) {
  const current = vel.dot(wish);
  const add = maxSpeed - current;
  if (add <= 0) return;
  vel.addScaledVector(wish, Math.min(accel * maxSpeed * dt, add));
}
function friction(vel, f, dt) {
  const s = vel.length(); if (s < 1e-4) return vel.set(0, 0, 0);
  vel.multiplyScalar(Math.max(s - s * f * dt, 0) / s);
}
```

## 2. Armas (todo en una tabla de datos, no en el código)

| | Fusil | Pistola | Escopeta | Francotirador |
|---|---|---|---|---|
| Daño cuerpo / cabeza | 25 / 50 | 30 / 60 | 12 × 8 perdigones | 90 / 200 |
| Cadencia | 600 RPM auto | semi, máx 400 | 70 RPM | 45 RPM |
| Cargador / reserva | 30 / 120 | 12 / 48 | 6 / 30 | 5 / 20 |
| Recarga táctica / vacía | 1,9 / 2,4 s | 1,3 / 1,6 s | 0,5 s por cartucho | 2,8 / 3,2 s |
| Dispersión cadera / apuntando | 2,5° / 0,3° | 2° / 0,4° | 6° / 4° | 8° / 0° |
| Caída de daño | 25 m → 60 % a 50 m | 15 m | 8 m → 20 % a 20 m | ninguna |

- **Hitscan** (rayo instantáneo) para balas; proyectiles solo para granadas o cohetes.
- **Retroceso aprendible**: un patrón fijo por arma (arriba y algo a un lado) más un poco de aleatoriedad. El primer disparo es preciso.
  - Patada de cámara: 0,6–1,2° de pitch y ±0,3° de yaw por disparo, recuperación con muelle (vuelve al 80 % en ~0,25 s).
  - La dispersión crece con cada disparo (+0,4°) y al moverse; se recupera en 0,3 s.
- Apuntar (ADS): 0,2 s de transición, el FOV baja, la sensibilidad baja en la misma proporción, la dispersión casi desaparece.
- Cambio de arma: 0,35 s (guardar + sacar). Recarga cancelable al correr o cambiar.
- Sin balas: clic de vacío + recarga automática si la reserva tiene munición.
- Disparo a la cabeza: hitbox separada (esfera o caja en la cabeza), multiplicador ×2.

## 3. Viewmodel (el arma en pantalla)

- Escena y cámara **propias**, dibujadas después del mundo tras `renderer.clearDepth()`: así el arma nunca atraviesa paredes y puede tener su propio FOV (≈ 60°).
- Balanceo (sway): el arma se retrasa respecto al ratón (lerp ~10/s, límite 0,05 rad).
- Bob al andar: figura en ocho (x = sin t, y = |sin t| · 0,5), mayor al correr. Al correr, arma inclinada hacia abajo.
- Retroceso: −0,06 m en Z y +0,08 rad en X por disparo, vuelve con muelle (rigidez ≈ 300, amortiguación ≈ 25).
- Recarga: animación procedural (el arma baja y gira 0,6 rad, sube al final) sincronizada con dos sonidos: cargador fuera y dentro.

## 4. Impacto y feedback (lo que hace que "pegue")

- **Fogonazo**: sprite aditivo en la boca del arma 1–2 frames + `PointLight` breve (intensidad alta, distancia 6 m).
- **Trazadoras**: línea fina y brillante desde el cañón al impacto, 60 ms, una de cada 2–3 balas.
- **Impactos**: chispas (partículas en pool), polvo y agujero de bala (plano orientado a la normal, máx. 60 en un pool circular).
- **Hitmarker**: cruz de 120 ms con un "tic" seco; roja y más grande si es baja; sonido distinto para disparo a la cabeza.
- **Enemigo alcanzado**: parpadeo blanco de 60 ms, retroceso de su cuerpo, frase o quejido. Al morir: caída con física simple o animación, nunca desaparecer de golpe.
- **Daño recibido**: indicador de dirección (arco rojo alrededor de la mira, 1 s), viñeta roja según la vida, sonido apagado si la vida es baja, sacudida de cámara pequeña.
- Vida que se regenera tras 4 s sin recibir daño (estilo CoD) o botiquines: elige uno según el diseño.

## 5. Enemigos (resumen; detalle en `ia-enemigos.md`)

- Estados: patrulla → alerta (oye un disparo o te ve) → combate (cobertura, asomarse, ráfagas) → flanqueo → búsqueda de la última posición conocida → retirada con poca vida.
- **Sistema de turnos de ataque**: como mucho 2 enemigos disparando a la vez; el resto se mueve o busca cobertura. Es el truco que hace que los tiroteos sean intensos pero justos.
- Tiempo de reacción 0,3–0,6 s al verte; la precisión depende de la distancia, de si te mueves y del tiempo que llevan viéndote. Primera ráfaga casi siempre falla cerca de ti (aviso).
- Variedad con roles, no con más vida: fusilero (media distancia), asaltante (corre y usa escopeta), pesado (lento, más blindaje, ametralladora), francotirador (láser visible antes de disparar).

## 6. Diseño del mapa

- Tres carriles con conexiones; líneas de visión de 40 m como máximo en mapas pequeños.
- Cobertura a la altura de la cintura cada 5–8 m; mezclar coberturas altas y bajas.
- Puntos de referencia y colores por zona para orientarse; algo de verticalidad (cajas, plataformas, rampas).
- Aparición de enemigos fuera de la vista del jugador y a más de 15 m.

## 7. HUD

- Mira dinámica que se abre con la dispersión; desaparece al apuntar.
- Abajo a la derecha: munición `30 / 120` y nombre del arma. Abajo a la izquierda: vida (o solo viñeta roja), minimapa o brújula arriba.
- Lista de bajas, anuncio de oleada, +puntos flotantes, aviso "RECARGAR" con poca munición.
- Tipografía condensada, alto contraste, sombras suaves; nada de texto pequeño sobre el escenario sin fondo.

## 8. Audio

- Disparo en capas: golpe transitorio + cuerpo grave + cola con reverberación. Tono ±5 % aleatorio para que no suene a máquina.
- Disparos enemigos posicionales (`PannerNode` con `HRTF` o `THREE.PositionalAudio`) y más apagados con la distancia (filtro paso bajo).
- Sonidos para: pasos, recarga (2 partes), vacío, hitmarker, baja, disparo a la cabeza, daño recibido, recoger objeto, nueva oleada.
- Música con dos capas (calma / combate) que cruzan según haya enemigos en alerta.
- Crear el `AudioContext` tras el primer clic (política de los navegadores).

## 9. Móvil y mando

- Táctil (`matchMedia('(pointer: coarse)')`): joystick virtual a la izquierda, arrastrar en la mitad derecha para mirar, botones de disparo, apuntar, recargar, saltar y cambiar arma (≥ 56 px). Asistencia de apuntado suave en táctil.
- Mando: Gamepad API, zona muerta 0,15, curva de respuesta exponencial para mirar, gatillos para apuntar/disparar, vibración con `vibrationActuator` si existe.
- Ratón: `requestPointerLock({ unadjustedMovement: true })` si está disponible; pausa automática al perder el bloqueo.

## 10. Rendimiento

- Geometrías y materiales compartidos; `InstancedMesh` para cajas, balas y partículas.
- Nada de `new` dentro del bucle: vectores temporales reutilizados y pools.
- Raycasts solo contra listas concretas (nivel + hitboxes), no contra toda la escena.
- Sombras: una luz direccional, mapa de 2048, área ajustada al jugador.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`; escala de resolución dinámica si los FPS bajan de 50.

## 11. Librerías recomendadas (versiones fijadas siempre)

`three` (render), `three-mesh-bvh` (raycasts y colisiones rápidas con mallas), `@dimforge/rapier3d-compat` (física), `postprocessing` de pmndrs (bloom, SMAA, SSAO), `recast-navigation` (navmesh), `lil-gui` (ajustar valores en vivo), `stats.js` (FPS).
