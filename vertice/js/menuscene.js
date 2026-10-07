// Escena 3D del menú: estudio oscuro con iluminación cinematográfica, operador animado y
// vitrina de armas para el equipamiento.
import * as THREE from 'three';
import { Soldier } from './soldier.js';
import { buildGun } from './gunmodel.js';
import { WEAPONS, TEAMS } from './data.js';

export class MenuScene {
  constructor(app) {
    this.app = app;
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x07090c);
    s.fog = new THREE.Fog(0x07090c, 7, 18);
    this.camera = new THREE.PerspectiveCamera(32, app.aspect, 0.1, 60);
    this.camera.position.set(0, 1.35, 5.2);
    s.add(new THREE.HemisphereLight(0xa9bbd6, 0x2a221c, 1.1));
    const fill = new THREE.DirectionalLight(0xdfe8ff, 1.2); fill.position.set(-1, 2, 6); s.add(fill);
    const key = new THREE.SpotLight(0xffe2c0, 110, 14, 0.55, 0.6, 1.6); key.position.set(2.5, 4.5, 3.5); key.target.position.set(0, 1, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
    const rim = new THREE.SpotLight(0x3fa7ff, 55, 12, 0.6, 0.7, 1.6); rim.position.set(-3, 3, -2.5); rim.target.position.set(0, 1.2, 0);
    const rim2 = new THREE.SpotLight(0xff8a4a, 35, 12, 0.6, 0.7, 1.6); rim2.position.set(3.5, 2, -2.5); rim2.target.position.set(0, 1.2, 0);
    s.add(key, key.target, rim, rim.target, rim2, rim2.target);
    this.rim = rim; this.rim2 = rim2;
    // suelo
    const fc = document.createElement('canvas'); fc.width = fc.height = 256; const x = fc.getContext('2d');
    const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, '#2a2d31'); gr.addColorStop(1, '#07090c');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 256; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
    const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    // anillo de luz
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.2, 64), new THREE.MeshBasicMaterial({ color: 0x3fa7ff, transparent: true, opacity: 0.5 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005; s.add(ring); this.ring = ring;
    // partículas de polvo
    const n = 220, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 8; pos[i * 3 + 1] = Math.random() * 4; pos[i * 3 + 2] = (Math.random() - 0.5) * 6; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xc8d6e8, size: 0.015, transparent: true, opacity: 0.5, depthWrite: false }));
    s.add(this.dust);
    // entorno para reflejos metálicos (estudio)
    {
      const es = new THREE.Scene();
      const sph = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.MeshBasicMaterial({ color: 0x1b2028, side: THREE.BackSide }));
      es.add(sph);
      const panel = (c, x, y, z, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
      panel(0xfff0dd, 4, 5, 4, 5, 3); panel(0x6fb6ff, -6, 2, -3, 4, 4); panel(0xff8a5a, 6, 1, -4, 3, 3); panel(0x404850, 0, -6, 0, 12, 12);
      const pm = new THREE.PMREMGenerator(app.renderer);
      this.envRT = pm.fromScene(es, 0.03); s.environment = this.envRT.texture; s.environmentIntensity = 0.8; pm.dispose();
    }
    this.opGroup = new THREE.Group(); s.add(this.opGroup);
    this.gunGroup = new THREE.Group(); this.gunGroup.position.set(0, 1.25, 0); s.add(this.gunGroup);
    this.mode = 'operator'; this.t = 0; this.rotY = 0.35; this.dragV = 0; this.dragY = 0;
    this.soldier = null; this.gun = null;
  }
  setOperator(look, weaponId, camo) {
    if (this.soldier) this.opGroup.remove(this.soldier.root);
    this.soldier = new Soldier(look, look.accent ? new THREE.Color(look.accent).getHex() : TEAMS[0].hex, weaponId, { camo });
    this.soldier.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.opGroup.add(this.soldier.root);
  }
  setWeapon(id, optic, camo) {
    if (this.gun) this.gunGroup.remove(this.gun.group);
    const def = WEAPONS[id];
    this.gun = buildGun(def, { optic, camo, detail: true });
    const g = this.gun.group;
    // centrar
    const box = new THREE.Box3().setFromObject(g); const c = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3());
    g.position.sub(c);
    const sc = 1.25 / Math.max(size.z, 0.3);
    this.gunGroup.scale.setScalar(sc);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.gunGroup.add(g);
  }
  view(mode) { this.mode = mode; }
  drag(dx) { this.dragV += dx * 0.01; this.dragY = (this.dragY || 0) + dx * 0.01; }
  render(dt) {
    const r = this.app.renderer;
    this.t += dt;
    this.dragV *= Math.pow(0.02, dt);
    this.rotY += this.dragV * dt * 10 + dt * 0.12;
    const op = this.mode === 'operator';
    this.opGroup.visible = op; this.gunGroup.visible = this.mode === 'weapon';
    if (this.soldier && op) {
      this.opGroup.rotation.y = this.rotY;
      this.soldier.update(dt, { speed: 0, crouch: false, aimPitch: -0.05 + Math.sin(this.t * 0.8) * 0.03, grounded: true, idle: true });
      this.soldier.spine.rotation.x += Math.sin(this.t * 1.6) * 0.01;
    }
    if (this.mode === 'weapon') { this.gunGroup.rotation.y = Math.PI / 2 + Math.sin(this.t * 0.5) * 0.45 + this.dragY; this.gunGroup.rotation.x = Math.sin(this.t * 0.6) * 0.06; this.gunGroup.rotation.z = 0.04; }
    const narrow = window.innerWidth <= 760;
    const wpn = this.mode === 'weapon';
    const targetX = wpn ? (narrow ? -0.45 : 0.12) : -0.85;
    this.rim.intensity = wpn ? 12 : 55; this.rim2.intensity = wpn ? 20 : 35;
    const targetZ = wpn ? 3.4 : 5.2;
    const k = Math.min(1, dt * 4);
    this.camera.position.x += (targetX - this.camera.position.x) * k;
    this.camera.position.z += (targetZ - this.camera.position.z) * k;
    this.camera.position.y = (wpn ? 1.32 : 1.2) + Math.sin(this.t * 0.3) * 0.03;
    this.camera.lookAt(this.camera.position.x, wpn ? 1.25 : 1.0, 0);
    this.ring.material.opacity = 0.35 + Math.sin(this.t * 2) * 0.12;
    this.dust.rotation.y = this.t * 0.02;
    r.autoClear = true;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    r.render(this.scene, this.camera);
  }
  resize() { this.camera.aspect = this.app.aspect; this.camera.updateProjectionMatrix(); }
}
