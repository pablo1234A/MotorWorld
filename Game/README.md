# MotorWorld: Open Road

Juego de carreras de mundo abierto para móvil (Android prioritario) y navegador. Todo el contenido (isla, coches, texturas, sonido, música, iconos) se genera por código, así que no hay ningún asset de terceros con copyright. Ver [LICENSES.md](LICENSES.md).

## Arranque rápido

```bash
cd Game
npm ci
npm run dev          # http://localhost:5173  (juego completo con hot reload)
npm test             # tests unitarios (Vitest)
npm run e2e          # smoke test en Chromium headless (requiere `npm run dev` en marcha)
npm run build        # typecheck + build de producción en dist/
npm run preview      # sirve dist/
```

### Un solo archivo HTML

```bash
npm run build:html   # dist-single/MotorWorld.html (~1,1 MB, todo incluido)
```

Ese archivo se abre con doble clic o se sube a cualquier hosting estático; no necesita servidor ni conexión. Las fuentes solo incluyen los caracteres latinos (español e inglés).

### APK de Android

- **CI (recomendado):** cada push ejecuta `.github/workflows/android.yml`, que pasa los tests, compila la web, sincroniza Capacitor y genera `app-debug.apk`. Se descarga desde la pestaña *Actions* del repositorio → la ejecución → artefacto **MotorWorld-OpenRoad-debug-apk**.
- **Local:** necesita JDK 17 y el Android SDK (`ANDROID_HOME`).
  ```bash
  npm run build && npx cap sync android
  cd android && ./gradlew assembleDebug    # android/app/build/outputs/apk/debug/app-debug.apk
  ```
- **PWA:** al servir `dist/` por HTTPS se puede instalar desde el navegador del móvil ("Añadir a pantalla de inicio"). Funciona sin conexión gracias al service worker. El workflow `pages.yml` (manual) lo publica en GitHub Pages.

## Controles

| Acción | Teclado | Mando | Táctil |
|---|---|---|---|
| Acelerar / frenar | W / S, ↑ / ↓ | RT / LT | pedales GAS / BRK |
| Girar | A / D, ← / → | stick izq. | flechas, deslizador o inclinación (se elige en Ajustes) |
| Freno de mano | Espacio | A | E-BRAKE |
| Nitro | Shift / N | B | NITRO |
| Cambio manual ▲ / ▼ | E / Q | RB / LB | botones + / − (con el cambio manual activo) |
| Cámara | C | Y | botón de cámara |
| Reiniciar en carretera | R | X | botón de reinicio |
| Mapa | M | Select | botón de mapa |
| Pausa | Esc / P | Start | botón de pausa |
| Mirar atrás | B | R3 | — |
| Claxon | H | L3 | — |
| Interactuar (taller, gasolinera, evento) | F / Enter | cruceta ↑ | aviso que aparece en pantalla |

En **Ajustes** se configuran el modo de dirección táctil, la sensibilidad, el cambio manual o automático, las ayudas (ABS, control de tracción, estabilidad y asistencia de dirección), la vibración, el audio, el idioma (ES/EN), las unidades, la densidad de tráfico, la calidad gráfica y el clima y la hora en modo libre.

## Contenido

- **Isla de 4 × 4 km**: ciudad con cuadrícula y bulevar, puerto industrial, autopista de circunvalación, carreteras secundarias, zona rural, puerto de montaña con curvas de herradura, bosque, túneles, puentes sobre el río, carretera costera, gasolineras, talleres, miradores y zonas de competición.
- **10 coches originales**: Petra Hot 2.0T (hot hatch, FWD), Kensei Raiden RS (JDM, AWD), Halden Vektor S (berlina deportiva), Brannock Thunder V8 (muscle, RWD), Wessel Kurve 9 (deportivo europeo), Volta Strale V8 (superdeportivo de motor central), Aurion Zenith (hiperdeportivo), Ardent Volcan S (SUV deportivo), Ridgeback Trail 4x4 (todoterreno) y Aldano Classica 67 (clásico).
- **20 eventos** de 10 tipos: sprint, circuito, carrera urbana, montaña, contrarreloj, velocidad punta, drift, persecución, checkpoints y especiales.
- **Progresión**: dinero, XP, niveles, desbloqueo de coches y piezas, descubrimientos (miradores, radares, carreteras), con guardado local robusto (dos ranuras alternas con checksum, de modo que una escritura corrupta nunca borra el progreso, y migraciones de versión).
- **Taller**: motor, turbo, escape, admisión, ECU, transmisión, diferencial, suspensión, frenos, neumáticos, peso y aerodinámica, todo con efecto real en la simulación; además ajuste fino (altura, rigidez, barras, caída, convergencia, reparto de frenada, relaciones de cambio, alerón) y estética (pintura y acabado, vinilos, llantas, alerón, paragolpes, capó, tintado y luces).
- **Clima y día/noche** dinámicos: sol, nubes, lluvia y tormenta con rayos. La lluvia cambia el agarre y el asfalto se moja y se seca poco a poco.
- **Tráfico IA** (modelo IDM, cambios de carril, cruces), **rivales IA** con perfiles, errores y rebufo, y **policía** en persecuciones.

## Arquitectura

| Carpeta pedida | Ubicación en el proyecto |
|---|---|
| /Game | `src/game` (bucle, modos, contexto), `src/main.ts` |
| /Scenes | `src/scenes` (garaje/showroom), `src/dev` (escenas de prueba) |
| /Scripts | `src/core` (input, calidad, i18n, ruido, eventos) |
| /Vehicles | `src/vehicles` (catálogo, tuning, geometría procedural, materiales, rendimiento) |
| /Physics | `src/physics` (neumáticos, motor, transmisión, diferenciales, colisiones, simulación a 120 Hz) |
| /World | `src/world` (terreno, carreteras, streaming por chunks, LOD, oclusión, vegetación, agua, mapa, GPS) |
| /AI | `src/ai` (tráfico, rivales, policía) |
| /UI | `src/ui` (HUD, minimapa, controles táctiles, menús, pantallas) |
| /Audio | `src/audio` (motor por AudioWorklet, SFX, música generativa) |
| /VFX | `src/vfx`, `src/env` (partículas, marcas de derrape, lluvia, cielo, iluminación) |
| /SaveSystem | `src/save`, `src/progression` |
| /Networking | no aplica (juego offline) |
| /Tools | `tools/` (capturas, benchmarks, iconos) |
| /Tests | `tests/unit`, `tests/e2e` |
| /Build | `android/`, `capacitor.config.ts`, `vite.config.ts`, `.github/workflows` |
| /Assets | `public/` (iconos, manifest, service worker). El resto de assets se generan en tiempo de ejecución |

### Rendimiento en móvil

- Perfiles **LOW / MEDIUM / HIGH / ULTRA**, autodetectados según el dispositivo y con bajada automática si caen los FPS (resolución dinámica, sombras, distancia de dibujado, densidad de vegetación y tráfico, bloom).
- Streaming de chunks de 256 m con LOD de terreno, terreno lejano y skyline de bajo coste.
- Instancing de árboles, farolas y tráfico, y edificios fusionados por chunk (pocos draw calls).
- Culling por frustum, más oclusión por software en la ciudad.
- Pooling de partículas (ring buffer) y reciclado de vehículos de tráfico instanciados.
- Caché de la isla generada en IndexedDB: la segunda carga tarda unos 0,6 s en lugar de unos 1,5 s.

## Herramientas de desarrollo

- `?view=showroom&car=<id>&rot=<rad>` muestra un coche aislado.
- `?view=drive` abre la prueba de conducción.
- `node tools/shot.mjs <url> <out.png>` hace una captura headless.
- `node tools/play.mjs` reproduce una partida guionizada.
- `node tools/boottime.mjs` mide el tiempo de arranque.
