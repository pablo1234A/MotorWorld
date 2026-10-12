# Gráficos de nivel profesional con Three.js

## Configuración base del renderer (la diferencia entre "demo" y "juego")

```js
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // o AgXToneMapping en versiones recientes
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Reflejos e iluminación ambiental realistas sin HDRI externo:
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
```
Con assets: carga un HDRI de Poly Haven con `RGBELoader` → `pmrem.fromEquirectangular()` para `scene.environment` y `scene.background`.

## Iluminación
- Una luz direccional (sol/luna) con sombras + `HemisphereLight` suave + entorno PMREM. Más luces dinámicas = menos FPS.
- Sombra: `mapSize` 2048, cámara de sombra ajustada al área visible y que siga al jugador; `bias` −0,0005, `normalBias` 0,02 para evitar acné.
- Luces de acento (lámparas, alarmas) como emisivos + bloom, no como luces reales.
- Mejor calidad: hornear luz y oclusión ambiental en Blender (lightmaps) para el escenario estático.

## Materiales
- `MeshStandardMaterial` / `MeshPhysicalMaterial` con roughness y metalness reales: metal pintado 0,5/0,6, hormigón 0,9/0, plástico 0,4/0, cristal con `transmission`.
- Sin texturas: genera ruido en un `<canvas>` (hormigón, óxido, ladrillo) y úsalo como `map` y `roughnessMap`. Variación de color por objeto (±5 % de brillo) para evitar el efecto "todo igual".
- Con texturas: PBR de ambientCG o Poly Haven (albedo, normal, roughness, AO), comprimidas en KTX2.

## Atmósfera y posprocesado
- `scene.fog = new THREE.FogExp2(colorCielo, 0.012)`: profundidad instantánea y oculta el final del mapa.
- Cielo con degradado (shader o textura de canvas) o `Sky` de los addons.
- Posprocesado (`postprocessing` de pmndrs o `EffectComposer`), en este orden: SSAO/N8AO suave → bloom selectivo (umbral alto, solo emisivos y fogonazos) → corrección de color/LUT → viñeta → SMAA. Desactivable en ajustes para equipos lentos.
- Partículas: puntos o sprites aditivos con `depthWrite: false`; humo con texturas suaves y pocas partículas grandes.

## Assets gratuitos de calidad (comprueba la licencia de cada uno)
- **CC0**: Poly Haven (HDRI, texturas, modelos), ambientCG (texturas), Kenney (packs completos), Quaternius (personajes y armas low-poly animados).
- **Gratis con condiciones**: Mixamo (animaciones de personajes, cuenta Adobe), Sketchfab (filtra por licencia CC-BY o CC0 y da crédito).
- **Sonido**: Freesound (revisa la licencia de cada sonido), Sonniss GDC bundles (libres de derechos).
- Formato: glTF/GLB, optimizado con `npx gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2`.

## Animación de personajes
`AnimationMixer` + `crossFadeTo` (0,2 s) entre idle/andar/correr/disparar; capas con máscara para disparar mientras se corre; velocidad de la animación ligada a la velocidad real para que no patinen los pies.

## Presupuestos (para 60 FPS en un portátil medio)
< 300 draw calls, < 500k triángulos visibles, texturas ≤ 2048 px, 1 luz con sombras, posprocesado a resolución completa solo si sobra margen. Mide con `renderer.info` y el panel de rendimiento del navegador.

## Estilo antes que realismo
Sin assets profesionales, un **estilo coherente** (low-poly con paleta limitada, cel-shading, neón nocturno, niebla densa) se ve mucho mejor que un realismo fallido. Elige una paleta de 4–6 colores y una hora del día con luz dramática (atardecer, noche con farolas, niebla matinal).
