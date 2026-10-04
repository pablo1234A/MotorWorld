// Still "studio shots" of each burger, rendered once on the client with the
// hero's light rig: an assembled frame and an exploded frame per burger.
// A real photo can replace any card image — see README.
import * as THREE from 'three';
import { Burger } from './burger/Burger.js';
import { createRenderer, createStage } from './burger/stage.js';

const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 16)));

export async function renderSnapshots(keys, { width = 760, height = 950 } = {}) {
  const canvas = document.createElement('canvas');
  const renderer = createRenderer(canvas, { preserve: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  const { scene, shadow } = createStage(renderer, { shadowMapSize: 1024 });
  const camera = new THREE.PerspectiveCamera(24, width / height, 0.1, 100);
  const halfFov = THREE.MathUtils.degToRad(12);
  const out = {};
  const t0 = performance.now();

  const shoot = (burger, explode) => {
    const spread = 0.46;
    burger.pose({ explode, nx: explode ? 0.35 : 0, spread });
    const halfH = burger.height / 2 + explode * spread * (burger.layers.length - 1) * 0.5 + 0.3;
    const dist = Math.max(halfH / Math.tan(halfFov), (explode ? 1.55 : 1.42) / (Math.tan(halfFov) * camera.aspect)) + 1.1;
    camera.position.set(0, explode ? 1.4 : 2.1, dist);
    camera.lookAt(0, explode ? 0 : -0.08, 0);
    shadow.position.y = burger.bottom - 0.02;
    shadow.material.opacity = explode ? 0.55 : 0.85;
    renderer.render(scene, camera);
    return new Promise((res) =>
      canvas.toBlob((b) => res(b ? URL.createObjectURL(b) : canvas.toDataURL('image/png')), 'image/webp', 0.9)
    );
  };

  for (const key of keys) {
    await idle();
    const burger = Burger.fromRecipe(key);
    burger.group.rotation.set(0.05, -0.55, 0);
    scene.add(burger.group);
    const assembled = await shoot(burger, 0);
    await idle();
    const exploded = await shoot(burger, 1);
    burger.dispose();
    out[key] = { assembled, exploded };
  }
  console.info(`[Flanagan’s] renders listos (${keys.length} burgers, ${Math.round(performance.now() - t0)} ms)`);
  renderer.dispose();
  renderer.forceContextLoss?.();
  return out;
}
