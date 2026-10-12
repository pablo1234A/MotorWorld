# Videojuegos — índice y estándar de calidad

Lee este archivo entero (es corto) y después **solo** la guía específica que necesites.

| Necesitas | Lee |
|---|---|
| Shooter en primera persona (FPS) o tercera persona | `fps.md` |
| Que se sienta bien: impacto, respuesta, "juice" con valores exactos | `game-feel.md` |
| Estructura de código: bucle, estados, input, guardado, pooling | `arquitectura.md` |
| Que se vea profesional en Three.js: luz, materiales, posprocesado, assets | `graficos.md` |
| IA de enemigos: percepción, coberturas, flanqueo, navegación | `ia-enemigos.md` |
| Plataformas, carreras, top-down, roguelike, puzzle, terror, estrategia | `generos.md` |
| Multijugador online | `multijugador.md` |
| Godot, Unity o Unreal; producción, equipo y publicación | `motores.md` |

Base jugable lista: `examples/fps-pro.html` (FPS completo en un archivo). Pruébalo siempre con `scripts/test-juego.mjs`.

## 1. Alcance: elige el escalón correcto (dilo al usuario en una línea)

| Escalón | Qué se consigue | Herramienta |
|---|---|---|
| A. Un solo HTML | Juego completo y pulido con geometría procedural y sonido sintetizado. Se ve "estilizado", no fotorrealista | Three.js / Canvas |
| B. Proyecto web | Modelos glTF reales, animaciones Mixamo, texturas PBR, físicas, niveles hechos en Blender | Vite + TypeScript + Three.js + Rapier |
| C. Motor | Gráficos de consola, animación avanzada, consolas/Steam | Godot 4 / Unity / Unreal 5 |

La calidad visual de un juego AAA viene sobre todo de los **assets** (modelos, texturas, animaciones, sonido grabado) y de equipos de cientos de personas. Lo que sí se puede igualar o superar desde código es la **sensación al jugar**: respuesta del control, impacto de las armas, IA creíble, ritmo y pulido. Ahí es donde se gana. Para el aspecto visual, usa los mejores assets CC0 disponibles (ver `graficos.md`) o pide al usuario los suyos.

## 2. Proceso profesional (en este orden)

1. **Pitch de 3 líneas**: fantasía del jugador ("soy un soldado de élite que limpia un puerto de noche"), bucle central, qué lo hace distinto.
2. **Bucle central jugable primero** (moverse + disparar + un enemigo). Si no es divertido en 30 s con cubos, el arte no lo salvará.
3. **Vertical slice**: un nivel con todo al nivel de calidad final (feel, HUD, sonido, menú, game over).
4. **Prueba automática** con `scripts/test-juego.mjs`: carga sin errores, el jugador puede morir, los enemigos pueden morir, se puede reiniciar. Después, ajuste de números.
5. **Contenido**: más enemigos, armas, oleadas o niveles, reutilizando sistemas.
6. **Pulido** con la checklist de abajo.

## 3. Checklist "sensación profesional" (todo juego debe pasarla)

**Respuesta**
- [ ] 60 FPS estables en un portátil normal; `deltaTime` limitado (máx. 1/30 s) o paso fijo.
- [ ] Cada acción del jugador tiene respuesta visual **y** sonora en el mismo frame.
- [ ] Controles con aceleración/inercia ajustada, no movimiento instantáneo ni resbaladizo.

**Claridad**
- [ ] El jugador sabe siempre: vida, munición, objetivo, desde dónde le disparan y por qué ha muerto.
- [ ] Los enemigos avisan antes de hacer daño (telegrafiado: fogonazo, sonido, animación).

**Estructura**
- [ ] Menú con controles, pausa (Esc / pérdida de foco), ajustes (sensibilidad, volumen, FOV, invertir Y), game over con estadísticas y reinicio instantáneo, récord guardado.
- [ ] Pantalla de carga si hay assets; nunca una pantalla negra.

**Accesibilidad y plataformas**
- [ ] Controles táctiles si puede abrirse en móvil (joystick virtual + arrastrar para mirar), o aviso claro.
- [ ] Mando (Gamepad API) si es de acción.
- [ ] Opción para reducir sacudidas de cámara; no depender solo del color.

**Técnica**
- [ ] Sin errores en consola. Sin crear objetos por frame (pooling). Geometrías y materiales compartidos.
- [ ] Probado con `scripts/test-juego.mjs` y la causa de cada fallo corregida.

## 4. Errores que delatan un juego amateur
Movimiento sin inercia; disparos sin retroceso ni sonido; enemigos que caminan en línea recta hacia ti y aciertan siempre; daño sin indicar dirección; muerte sin explicación; todo del mismo gris; ningún menú; números sin equilibrar (enemigos esponja de balas).
