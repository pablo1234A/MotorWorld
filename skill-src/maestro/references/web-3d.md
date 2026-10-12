# 3D y WebGL en la web

## Herramientas
Three.js (base), React Three Fiber + Drei (React), Spline (diseño visual sin código, exporta a web), Babylon.js (juegos), Theatre.js (animación con timeline), modelos en glTF/GLB comprimidos con Draco/Meshopt (`npx gltf-transform optimize in.glb out.glb`).

## Reglas de rendimiento
- Presupuesto: < 100k triángulos en móvil, texturas ≤ 2048 px (KTX2), < 100 draw calls.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- Pausar el render cuando el canvas no está visible (IntersectionObserver).
- Iluminación horneada (baked) > luces dinámicas. Un environment map HDR da realismo barato.
- Fallback: imagen estática si no hay WebGL o con `prefers-reduced-motion`.

## Escena mínima (Three.js, módulos ES)
```html
<canvas id="c"></canvas>
<script type="module">
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100); camera.position.z = 5;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, .32, 200, 32),
  new THREE.MeshStandardMaterial({ color: 0xd9d4c7, roughness: .25, metalness: .6 }));
scene.add(mesh, new THREE.HemisphereLight(0xffffff, 0x222222, 2));
function resize(){ const {clientWidth:w, clientHeight:h} = canvas;
  renderer.setSize(w, h, false); camera.aspect = w/h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
renderer.setAnimationLoop(t => { mesh.rotation.y = t/2000; renderer.render(scene, camera); });
</script>
```
