# VÉRTICE · Frente Urbano

Prototipo jugable de **FPS militar competitivo para móvil** (y navegador de escritorio), hecho con WebGL (Three.js). Todo el contenido es original: nombre, logotipo, mapa, operadores, armas, aspectos, rachas, sonidos (sintetizados por código) e interfaz.

## Cómo jugar

El juego no necesita compilación. Basta con servir la carpeta `vertice/` por HTTP (los módulos ES no funcionan con `file://`):

```bash
cd vertice
npx http-server -p 8080 .        # o: python3 -m http.server 8080
```

Abre `http://<tu-ip>:8080` en el móvil (misma red WiFi), gíralo en horizontal y toca **TOCA PARA COMENZAR**. También funciona publicado en GitHub Pages o cualquier hosting estático.

Flujo: **MENÚ → PLAY → MODO → EQUIPAMIENTO → DESPLEGAR → partida → VICTORIA/DERROTA → RESULTADOS → JUGAR DE NUEVO**.

### Controles táctiles
| Zona / botón | Acción |
|---|---|
| Mitad izquierda | Joystick flotante (empujarlo al máximo hacia delante = sprint automático) |
| Mitad derecha | Arrastrar para mirar (también mientras mantienes DISPARAR) |
| Botón ámbar grande (y el izquierdo opcional) | Disparar |
| Mira | Apuntar (alternar o mantener, configurable) |
| ↻ / ⌃ / ⌄ / ⚡ | Recargar / saltar / agacharse (en sprint: deslizar) / sprint |
| Granada / táctica | Mantener = ver trayectoria, soltar = lanzar |
| USAR (aparece al acercarte) | Plantar/desactivar carga, subir/bajar del vehículo |
| Panel de armas (abajo) | Cambiar de arma |
| Iconos de racha | Activar rachas disponibles |
| Tiempo (arriba) | Marcador completo · ❚❚ pausa |

### Teclado y ratón
WASD mover · ratón mirar · clic izq. disparar · clic der. apuntar · R recargar · Espacio saltar · C/Ctrl agacharse · Shift sprint · Q/1/2/rueda cambiar arma · G granada · T táctica · E/F interactuar · 3/4/5 rachas · Tab marcador · Esc pausa.

## Contenido

- **Mapa «Puerto Varga»** (160 × 128 m): plaza central con monumento, avenida con autobús calcinado, mercado (oeste) con zona secreta, Edificio Brisa con oficinas interiores y azotea accesible, almacén con estanterías, patio de contenedores con grúa y posición elevada, muelle de carga, parque con pabellón, gasolinera, callejones, cristales y barriles destructibles, cajas que se rompen, farolas, cableado, fuegos y humo.
- **Modos**: Duelo por equipos, Dominio (A/B/C), Sabotaje (rondas sin reaparición, plantar/desactivar, cambio de bando) y Todos contra todos.
- **IA**: cono de visión, línea de visión, humo que ciega, oído (disparos, pasos, explosiones), supresión, memoria de amenazas, tiempo de reacción, puntería con error que converge, ráfagas, cobertura con asomado, flanqueo con rutas que evitan la línea de fuego, retirada y regeneración, granadas (letales, humo, aturdidoras), esquiva de granadas, presión cuando recargas, ruptura de puntos muertos, comunicación de escuadra con retardo y cercos coordinados. **FÁCIL / NORMAL / DIFÍCIL / ÉLITE** cambian el comportamiento, no solo la puntería.
- **Armas**: VX-9 Halcón, KR-4 Tormenta, Mosca R5, Bulldog 12, Sable LR-8, Yunque 7, Centinela M-DMR, Ronin P9, Toro .44 y Avispa MP, con daño por zona y distancia, cadencia, retroceso recuperable, dispersión, recarga táctica/vacía y apuntado. Ópticas (miras, punto rojo, holográfica, 3x) y 8 camuflajes.
- **Equipo**: granada de fragmentación, de impacto, humo y aturdidora; ventajas (kevlar, atleta, manos rápidas, carroñero, fantasma).
- **Rachas**: OJO DE HALCÓN (5), LLUVIA DE ACERO (8, designada) y ESPECTRO (12, dron artillado derribable). La IA también las gana y usa.
- **Vehículo**: Jabalí 4x4 conducible, con atropellos, daño y explosión.
- **Personalización**: 6 operadores, 8 aspectos, casco/gorra/capucha, accesorios faciales, mochila y color de acento.
- **Progresión**: XP, 30 niveles, desbloqueos, retos con recompensas cosméticas y estadísticas de carrera guardadas en el dispositivo.
- **Ajustes**: sensibilidad H/V/apuntado, asistencia de apuntado, invertir eje, controles táctiles, tamaño del HUD, calidad BAJA/MEDIA/ALTA, FPS objetivo 30/60/120, resolución dinámica, FOV y volúmenes.

## Rendimiento

Geometría estática fusionada por material, soldados con una malla por hueso y atlas de textura (~12 llamadas de dibujo por soldado), objetos destructibles instanciados, partículas en 2 llamadas, lluvia animada en GPU, sombras que siguen a la cámara, LOD de sombras y detalle, presupuesto de búsqueda de rutas por fotograma, IA escalonada y resolución dinámica para mantener los FPS objetivo.

## Estructura

```
vertice/
  index.html, css/game.css, icon.svg, manifest.webmanifest
  js/main.js        arranque, bucle, flujo de pantallas
  js/game.js        partida: escena, atmósfera, sistemas, cámara, fin
  js/map.js         mapa, colisiones, navegación, puntos de juego
  js/world.js       colisiones AABB, raycast DDA, movimiento con escalones
  js/nav.js         rejilla de navegación, A*, puntos de cobertura
  js/player.js      controlador del jugador
  js/bot.js         IA de los soldados    js/squad.js  coordinación
  js/combat.js      disparos, daño, bajas, explosiones
  js/modes.js       modos de juego         js/streaks.js rachas
  js/weapons.js, gunmodel.js, viewmodel.js, soldier.js, effects.js,
  js/projectiles.js, vehicle.js, hud.js, menus.js, menuscene.js,
  js/input.js, audio.js, textures.js, builder.js, data.js, profile.js, util.js
  js/lib/three.module.min.js (r170, MIT)
```
