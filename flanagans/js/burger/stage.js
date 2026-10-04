// Shared lighting rig: the hero and the still renders of the menu use the
// exact same light so every burger on the page belongs to one "photo set".
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { softShadow } from './textures.js';

export function createRenderer(canvas, { alpha = true, preserve = false, shadows = true } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha,
    preserveDrawingBuffer: preserve,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);
  if (shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }
  return renderer;
}

export function createStage(renderer, { shadowMapSize = 1024 } = {}) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.36;
  pmrem.dispose();

  // Warm key from the upper left — the "window light" of the shot.
  const key = new THREE.DirectionalLight(0xffd6a3, 2.35);
  key.position.set(-3.6, 6.2, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  Object.assign(key.shadow.camera, { left: -3.4, right: 3.4, top: 3.4, bottom: -3.4, near: 1, far: 22 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 5;
  scene.add(key);

  // Back rim: draws the glossy edge on the bun, cheese and sauce.
  const rim = new THREE.DirectionalLight(0xffe2bf, 3.4);
  rim.position.set(4.5, 3.2, -5);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xb9c8ff, 0.55);
  rim2.position.set(-5, 1.2, -3);
  scene.add(rim2);

  scene.add(new THREE.HemisphereLight(0xffe7cf, 0x1b0f07, 0.38));

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 4.2),
    new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false, opacity: 0.8, toneMapped: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -1;
  scene.add(shadow);

  return { scene, key, rim, shadow };
}
