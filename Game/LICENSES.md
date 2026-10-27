# Licencias y origen de los assets

## Contenido propio (generado por código)

El juego no usa ningún asset externo con copyright. Todo lo siguiente lo genera el propio código fuente de este repositorio:

| Asset | Cómo se genera | Archivo |
|---|---|---|
| Isla, terreno y carreteras | ruido simplex determinista + splines Catmull-Rom | `src/world/TerrainGen.ts`, `RoadNetwork.ts`, `WorldDef.ts` |
| Texturas (asfalto, hierba, roca, fachadas, ventanas, señales) | canvas 2D procedural | `src/world/Textures.ts` |
| Coches (carrocería, llantas, interiores, luces) | loft paramétrico de secciones + primitivas | `src/vehicles/BodyGeometry.ts`, `CarModel.ts`, `WheelBuilder.ts` |
| Pintura, vinilos y atlas de detalles | canvas 2D procedural | `src/vehicles/CarMaterials.ts` |
| Árboles, farolas, edificios, puentes y túneles | geometría procedural | `src/world/Vegetation.ts`, `Structures.ts` |
| Cielo, nubes y agua | shaders GLSL propios | `src/env/Sky.ts`, `src/world/Water.ts` |
| Sonido de motor | síntesis por cilindro en AudioWorklet | `src/audio/EngineWorklet.ts` |
| Efectos de sonido y música de menú | síntesis WebAudio (ruido filtrado, osciladores) | `src/audio/AudioEngine.ts` |
| Icono, splash y logotipo | SVG propio rasterizado con `tools/icons.mjs` | `public/icon.svg`, `android/app/src/main/res` |

Las marcas y modelos de los coches (Petra, Kensei, Halden, Brannock, Wessel, Volta, Aurion, Ardent, Ridgeback, Aldano) son inventados. Cualquier parecido con fabricantes reales es casual.

## Dependencias de terceros

| Paquete | Versión | Licencia | Uso |
|---|---|---|---|
| three | 0.170.0 | MIT | motor de render WebGL (incluido en el juego) |
| @capacitor/core, @capacitor/android | 6.2.2 | MIT | empaquetado nativo Android |
| @fontsource/rajdhani | 5.3.0 | SIL OFL 1.1 | tipografía de títulos y HUD |
| @fontsource/inter | 5.3.0 | SIL OFL 1.1 | tipografía de texto |
| @fontsource/jetbrains-mono | 5.3.0 | SIL OFL 1.1 | tipografía de cifras |
| vite | 5.4.11 | MIT | build (solo en desarrollo) |
| vitest | 2.1.8 | MIT | tests (solo en desarrollo) |
| typescript | 5.6.3 | Apache 2.0 | compilador (solo en desarrollo) |
| @capacitor/cli, @types/three | 6.2.2 / 0.170.0 | MIT | herramientas (solo en desarrollo) |

Las licencias MIT, Apache 2.0 y SIL OFL 1.1 permiten el uso comercial. La OFL permite incluir las fuentes en el juego, pero no venderlas por separado. Los textos completos de las licencias de todo lo que se distribuye con el juego están en `public/THIRD_PARTY_LICENSES.txt`, que se copia a la build web y al APK.
