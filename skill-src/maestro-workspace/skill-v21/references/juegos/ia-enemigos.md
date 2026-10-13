# IA de enemigos creíble (y justa)

El objetivo no es que la IA sea imbatible, sino que **parezca lista y sea justa**: que el jugador entienda qué hace y por qué ha perdido.

## Máquina de estados (base de casi todos los shooters)

```
PATRULLA ──ve/oye──▶ ALERTA (reacción 0,3–0,6 s) ──▶ COMBATE
   ▲                                                  │  │
   │                       pierde de vista 3 s ◀──────┘  │ vida < 30 %
   └── BÚSQUEDA (va a la última posición conocida, 8 s) ◀─┘──▶ RETIRADA (busca cobertura lejos)
```

- Cada estado tiene `enter()`, `update(dt)` y `exit()`. Guarda el tiempo que lleva en el estado.
- Decide como mucho 4–10 veces por segundo (no cada frame) y desfasado entre enemigos: ahorra CPU y parece más humano.

## Percepción

- **Vista**: cono de 110–140°, distancia 35 m; línea de visión con un rayo contra la geometría del nivel (no contra otros enemigos). Comprueba ojos → cabeza y ojos → pecho del jugador.
- **Oído**: un disparo alerta a los enemigos en 30 m (atenuado por paredes si quieres), los pasos al correr en 8 m.
- **Memoria**: guarda `ultimaPosicionConocida` y `tiempoDesdeQueLoVio`.
- **Comunicación**: el que te ve avisa a los que estén a menos de 15 m (sonido "¡Contacto!").

## Combate

- **Turnos de ataque**: un gestor global da como máximo 2 "fichas" de disparo. Sin ficha, el enemigo se mueve, recarga o cambia de cobertura. Tras 1,5–3 s disparando, devuelve la ficha.
- **Precisión**: `prob = base × factorDistancia × (jugadorQuieto ? 1 : 0,6) × min(1, tiempoViéndolo / 1,5)`. Primera ráfaga con prob. baja: es el aviso.
- **Ráfagas**: 3–6 disparos, pausa 0,6–1,2 s. Fogonazo y sonido siempre visibles: el jugador debe poder localizarlos.
- **Distancia preferida** según el rol (fusilero 10–25 m, asaltante 0–8 m, francotirador > 30 m). Si está demasiado cerca o lejos, se reposiciona.
- **Movimiento lateral** (strafe) al disparar: cambia de dirección cada 0,8–1,5 s.

## Coberturas

1. Pre-calcula puntos de cobertura junto a cada obstáculo (a 0,8 m de cada cara).
2. Para elegir uno, puntúa: `+ protege de la línea de visión del jugador` (rayo desde el jugador bloqueado), `+ cerca del enemigo`, `+ a su distancia preferida`, `− ocupado por otro`, `− en la línea de fuego de un aliado`.
3. Ciclo: correr a cobertura → agacharse 1–2 s → asomarse y disparar una ráfaga → volver.

## Flanqueo
Si el jugador lleva más de 6 s en la misma cobertura, uno de los enemigos sin ficha elige un punto con línea de visión al jugador desde un ángulo > 60° respecto al resto y va por una ruta que no cruce su vista.

## Navegación

- Mapa pequeño de cajas: rejilla de 1 m marcando celdas bloqueadas (inflar obstáculos 0,4 m) + A* con 8 direcciones + suavizado de ruta (eliminar puntos con línea directa).
- Mapas con mallas: navmesh con `recast-navigation` (web), `NavigationAgent3D` (Godot), NavMesh (Unity/Unreal).
- Separación entre enemigos (fuerza que los aleja si están a < 1,2 m) para que no se apilen.
- Recalcula la ruta solo si el objetivo se movió > 2 m o cada 0,5–1 s.

## Dificultad
Ajusta **reacción, precisión, número de fichas y agresividad**, no la vida. Fácil: reacción 0,8 s, precisión ×0,5, 1 ficha. Difícil: 0,25 s, ×1,2, 3 fichas, flanqueos frecuentes.

## Depuración
Modo debug que dibuje el cono de visión, la ruta, el estado actual encima de cada enemigo y la cobertura elegida. Sin esto, ajustar la IA es adivinar.
