// Soldado en tercera persona: modelo procedural con animación por código e IK de brazos.
import * as THREE from 'three';
import { camoTexture } from './textures.js';
import { SKINS, OPERATORS, WEAPONS } from './data.js';
import { buildGun } from './gunmodel.js';
import { clamp, lerp } from './util.js';

const G = {};
function geos() {
  if (G.ready) return G;
  G.ready = true;
  G.thigh = new THREE.CapsuleGeometry(0.085, 0.28, 3, 10); G.thigh.translate(0, -0.22, 0);
  G.knee = new THREE.SphereGeometry(0.07, 8, 6); G.knee.scale(1, 1, 0.8);
  G.shin = new THREE.CapsuleGeometry(0.066, 0.3, 3, 10); G.shin.translate(0, -0.21, 0);
  G.boot = new THREE.CapsuleGeometry(0.06, 0.15, 3, 8); G.boot.rotateX(Math.PI / 2); G.boot.scale(1.05, 0.85, 1); G.boot.translate(0, -0.455, -0.05);
  G.upper = new THREE.CapsuleGeometry(0.058, 0.2, 3, 8); G.upper.translate(0, -0.14, 0);
  G.fore = new THREE.CapsuleGeometry(0.05, 0.18, 3, 8); G.fore.translate(0, -0.13, 0);
  G.hand = new THREE.BoxGeometry(0.07, 0.09, 0.05); G.hand.translate(0, -0.3, 0);
  G.pelvis = new THREE.CapsuleGeometry(0.12, 0.12, 4, 10); G.pelvis.rotateZ(Math.PI / 2); G.pelvis.scale(1, 1, 0.9);
  G.belt = new THREE.CylinderGeometry(0.165, 0.165, 0.06, 14); G.belt.scale(1.05, 1, 0.8);
  G.chest = new THREE.CapsuleGeometry(0.17, 0.22, 4, 10); G.chest.scale(1.05, 1, 0.68);
  G.vest = new THREE.CapsuleGeometry(0.185, 0.17, 4, 12); G.vest.scale(1.1, 1, 0.78);
  G.plate = new THREE.BoxGeometry(0.3, 0.3, 0.05);
  G.pad = new THREE.SphereGeometry(0.075, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  G.pouch = new THREE.BoxGeometry(0.08, 0.1, 0.06);
  G.pack = new THREE.CapsuleGeometry(0.11, 0.18, 4, 8); G.pack.scale(1.15, 1, 0.65);
  G.neck = new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8);
  G.head = new THREE.SphereGeometry(0.112, 14, 10); G.head.scale(0.92, 1.05, 1);
  G.helmet = new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  G.cap = new THREE.SphereGeometry(0.122, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  G.brim = new THREE.BoxGeometry(0.16, 0.012, 0.1);
  G.beanie = new THREE.SphereGeometry(0.124, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58);
  G.hood = new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.7);
  G.goggles = new THREE.BoxGeometry(0.18, 0.05, 0.05);
  G.glasses = new THREE.BoxGeometry(0.17, 0.035, 0.03);
  G.mask = new THREE.BoxGeometry(0.17, 0.1, 0.08);
  G.gas = new THREE.CylinderGeometry(0.04, 0.05, 0.08, 10);
  G.band = new THREE.CylinderGeometry(0.066, 0.066, 0.05, 10);
  return G;
}

const matCache = new Map();
function materialsFor(look, accent) {
  const key = look.skin + '|' + look.operator + '|' + accent;
  if (matCache.has(key)) return matCache.get(key);
  const skin = SKINS[look.skin] || SKINS.urbano;
  const op = OPERATORS.find((o) => o.id === look.operator) || OPERATORS[0];
  const camo = camoTexture({ id: 'skin_' + skin.id, colors: skin.colors, pattern: skin.pattern }, 128);
  camo.repeat.set(2, 2);
  const dark = new THREE.Color(skin.colors[3] || skin.colors[1]).multiplyScalar(0.7);
  const m = {
    uniform: new THREE.MeshStandardMaterial({ map: camo, roughness: 0.92 }),
    vest: new THREE.MeshStandardMaterial({ color: dark, roughness: 0.85 }),
    gear: new THREE.MeshStandardMaterial({ color: new THREE.Color(skin.colors[1]).multiplyScalar(0.6), roughness: 0.8 }),
    skin: new THREE.MeshStandardMaterial({ color: op.skin, roughness: 0.65 }),
    hair: new THREE.MeshStandardMaterial({ color: op.hair, roughness: 0.9 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1d1e1f, roughness: 0.8 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x2a2219, roughness: 0.85 }),
    helmet: new THREE.MeshStandardMaterial({ color: new THREE.Color(skin.colors[1]).multiplyScalar(0.85), roughness: 0.6, metalness: 0.15 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x111518, roughness: 0.05, metalness: 0.9 }),
    accent: new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9, roughness: 0.5 }),
  };
  matCache.set(key, m);
  return m;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Soldier {
  // look: {operator, skin, headgear, facegear, backpack}; accent: color hex team
  constructor(look, accent, weaponId, opts = {}) {
    geos();
    this.look = look;
    const op = OPERATORS.find((o) => o.id === look.operator) || OPERATORS[0];
    const M = this.M = materialsFor(look, accent);
    const shadow = opts.shadow !== false;
    const root = this.root = new THREE.Group();
    const mk = (g, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = shadow; parent.add(o); return o; };
    const build = op.build;
    this.body = new THREE.Group(); this.body.scale.setScalar(build > 1 ? 1.0 : 0.97); root.add(this.body);
    const hips = this.hips = new THREE.Group(); hips.position.y = 0.95; this.body.add(hips);
    mk(G.pelvis, M.uniform, hips, 0, 0.0, 0);
    mk(G.belt, M.gear, hips, 0, 0.08, 0);
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(s * 0.1, -0.04, 0); hips.add(thigh);
      const tm = mk(G.thigh, M.uniform, thigh); tm.scale.set(build, 1, build);
      const shin = new THREE.Group(); shin.position.y = -0.45; thigh.add(shin);
      mk(G.shin, M.uniform, shin); mk(G.boot, M.boot, shin); mk(G.knee, M.vest, shin, 0, -0.01, -0.05);
      if (s === 1) mk(G.pouch, M.gear, thigh, 0.08, -0.15, 0);
      this.legs.push({ thigh, shin });
    }
    const spine = this.spine = new THREE.Group(); spine.position.y = 0.06; hips.add(spine);
    const chest = mk(G.chest, M.uniform, spine, 0, 0.3, 0); chest.scale.x *= build;
    const vest = mk(G.vest, M.vest, spine, 0, 0.31, 0); vest.scale.x *= build;
    mk(G.plate, M.vest, spine, 0, 0.33, -0.13);
    for (const x of [-0.09, 0, 0.09]) mk(G.pouch, M.gear, spine, x * build, 0.22, -0.16);
    mk(G.pouch, M.gear, spine, 0.19 * build, 0.22, -0.02); mk(G.pouch, M.gear, spine, -0.19 * build, 0.22, -0.02);
    if (look.backpack !== false) mk(G.pack, M.gear, spine, 0, 0.32, 0.17);
    mk(G.neck, M.skin, spine, 0, 0.56, 0);
    const head = this.head = new THREE.Group(); head.position.set(0, 0.68, 0); spine.add(head);
    mk(G.head, M.skin, head);
    const hg = look.headgear && look.headgear !== 'default' ? look.headgear : op.head;
    const fg = look.facegear && look.facegear !== 'default' ? look.facegear : op.face;
    if (hg === 'helmet') { mk(G.helmet, M.helmet, head, 0, 0.01, 0.005); const b = mk(G.goggles, M.gear, head, 0, 0.07, -0.1); b.scale.set(0.8, 0.6, 0.6); }
    else if (hg === 'cap') { mk(G.cap, M.gear, head, 0, 0.02, 0); mk(G.brim, M.gear, head, 0, 0.04, -0.13); }
    else if (hg === 'beanie') mk(G.beanie, M.gear, head, 0, 0.01, 0);
    else if (hg === 'hood') { const h = mk(G.hood, M.uniform, head, 0, -0.03, 0.02); h.rotation.x = 0.25; }
    else mk(G.cap, M.hair, head, 0, 0.01, 0.01);
    if (fg === 'glasses') mk(G.glasses, M.lens, head, 0, 0.02, -0.1);
    else if (fg === 'goggles') mk(G.goggles, M.lens, head, 0, 0.03, -0.1);
    else if (fg === 'balaclava') { const m = mk(G.mask, M.vest, head, 0, -0.04, -0.06); m.scale.set(1.05, 1.2, 1.2); }
    else if (fg === 'mask') mk(G.mask, M.vest, head, 0, -0.05, -0.07);
    else if (fg === 'gasmask') { mk(G.mask, M.gear, head, 0, -0.03, -0.07); const c = mk(G.gas, M.vest, head, 0, -0.06, -0.14); c.rotation.x = Math.PI / 2; mk(G.goggles, M.lens, head, 0, 0.03, -0.1); }
    // brazos
    this.arms = [];
    for (const s of [1, -1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.21 * build, 0.47, 0); spine.add(sh);
      mk(G.upper, M.uniform, sh); const pd = mk(G.pad, M.vest, sh, 0, 0.0, 0); pd.scale.set(1, 0.9, 1);
      if (s === -1) mk(G.band, M.accent, sh, 0, -0.08, 0);
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      mk(G.fore, M.uniform, el); mk(G.hand, M.glove, el);
      this.arms.push({ sh, el, side: s });
    }
    // arma
    this.gunHolder = new THREE.Group(); spine.add(this.gunHolder);
    this.setWeapon(weaponId, opts.camo);
    // estado de animación
    this.phase = 0; this.crouchT = 0; this.flinch = 0; this.recoil = 0; this.reloadT = -1; this.reloadDur = 1;
    this.dead = false; this.deathT = 0; this.deathDir = 1; this.aimPitch = 0; this.speed = 0; this.throwT = -1;
    this.lodLevel = 0;
  }
  setWeapon(id, camo) {
    if (this.gun) this.gunHolder.remove(this.gun.group);
    const def = WEAPONS[id] || WEAPONS.vx9;
    this.gun = buildGun(def, { detail: false, camo: camo || 'pavonado', optic: def.scope ? 'scope' : 'iron' });
    this.gun.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.gunHolder.add(this.gun.group);
    this.pistol = !!this.gun.pistol;
  }
  // brazo con IK de dos huesos en espacio del tronco
  _ik(arm, target, pole) {
    const S = arm.sh.position; const a = 0.28, b = 0.3;
    _v1.subVectors(target, S); let L = _v1.length();
    L = clamp(L, 0.08, a + b - 0.002); _v1.normalize();
    const cosA = clamp((a * a + L * L - b * b) / (2 * a * L), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    _v2.copy(pole).addScaledVector(_v1, -pole.dot(_v1)).normalize();
    const upper = _v3.copy(_v1).multiplyScalar(cosA).addScaledVector(_v2, sinA).normalize();
    arm.sh.quaternion.setFromUnitVectors(DOWN, upper);
    const elbow = _v2.copy(S).addScaledVector(upper, a);
    const fore = _v1.subVectors(target, elbow).normalize();
    _q.copy(arm.sh.quaternion).invert(); fore.applyQuaternion(_q);
    arm.el.quaternion.setFromUnitVectors(DOWN, fore);
  }
  // st: {speed, crouch, aimPitch, moving, sprint, firing, reloading, grounded}
  update(dt, st) {
    if (this.dead) { this._updateDeath(dt); return; }
    this.crouchT = lerp(this.crouchT, st.crouch ? 1 : 0, Math.min(1, dt * 10));
    const sp = st.speed;
    this.phase += dt * (sp > 0.2 ? (4 + sp * 1.25) : 0);
    const amp = clamp(sp / 5.5, 0, 1) * (st.sprint ? 0.9 : 0.6) * (1 - this.crouchT * 0.5);
    const c = this.crouchT;
    this.hips.position.y = lerp(0.95, 0.62, c) + Math.abs(Math.sin(this.phase)) * 0.03 * amp;
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i]; const ph = this.phase + i * Math.PI;
      const swing = Math.sin(ph) * amp;
      const knee = Math.max(0, Math.sin(ph + 1.4)) * amp * 1.2;
      L.thigh.rotation.x = swing + c * (i === 0 ? 1.2 : 0.7);
      L.shin.rotation.x = -knee - c * (i === 0 ? 1.7 : 1.9);
    }
    if (!st.grounded) { this.legs[0].thigh.rotation.x = 0.5; this.legs[0].shin.rotation.x = -0.9; this.legs[1].thigh.rotation.x = -0.2; this.legs[1].shin.rotation.x = -0.4; }
    this.flinch = Math.max(0, this.flinch - dt * 5);
    this.recoil = Math.max(0, this.recoil - dt * 10);
    this.aimPitch = lerp(this.aimPitch, st.aimPitch || 0, Math.min(1, dt * 12));
    const sprintPose = st.sprint ? 1 : 0;
    this.spine.rotation.x = -this.aimPitch * 0.55 + this.flinch * 0.35 + c * 0.15 + sprintPose * 0.15;
    this.spine.rotation.y = Math.sin(this.phase) * amp * 0.08;
    this.head.rotation.x = -this.aimPitch * 0.45;
    // arma: posición de apuntado en el tronco
    const gh = this.gunHolder;
    let gx = 0.1, gy = 0.38, gz = -0.32, rx = -this.aimPitch * 0.45, ry = 0, rz = 0;
    if (this.pistol) { gx = 0.0; gy = 0.4; gz = -0.42; }
    if (st.sprint) { gx = 0.05; gy = 0.3; gz = -0.25; rx = -0.6; ry = 0.6; }
    gz += this.recoil * 0.05; rx += this.recoil * 0.12;
    if (this.reloadT >= 0) {
      this.reloadT += dt; const k = Math.sin(clamp(this.reloadT / this.reloadDur, 0, 1) * Math.PI);
      rx -= k * 0.5; rz = k * 0.4; gy -= k * 0.06;
      if (this.reloadT > this.reloadDur) this.reloadT = -1;
    }
    if (this.throwT >= 0) { this.throwT += dt; const k = Math.sin(clamp(this.throwT / 0.5, 0, 1) * Math.PI); gy -= k * 0.15; rx -= k * 0.8; if (this.throwT > 0.5) this.throwT = -1; }
    gh.position.set(gx, gy, gz); gh.rotation.set(rx, ry, rz);
    gh.updateMatrix();
    // manos sobre el arma
    const right = _tR.copy(this.gun.grip).applyMatrix4(gh.matrix);
    const left = _tL.copy(this.gun.fore).applyMatrix4(gh.matrix);
    if (this.reloadT >= 0 && this.gun.mag) { left.copy(this.gun.magHome).applyMatrix4(gh.matrix); left.y -= 0.05 * Math.sin(this.reloadT * 6); }
    this._ik(this.arms[0], right, _poleR);
    this._ik(this.arms[1], left, _poleL);
  }
  kill(dirSign = 1) {
    if (this.dead) return;
    this.dead = true; this.deathT = 0; this.deathDir = dirSign;
    this.deathSide = Math.random() < 0.5 ? -1 : 1;
  }
  revive() {
    this.dead = false; this.deathT = 0; this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0); this.root.visible = true;
  }
  _updateDeath(dt) {
    this.deathT += dt;
    const t = clamp(this.deathT / 0.65, 0, 1); const e = t * t;
    this.body.rotation.x = -this.deathDir * e * 1.45;
    this.body.rotation.z = this.deathSide * e * 0.25;
    this.body.position.y = e * 0.12;
    this.hips.position.y = lerp(this.hips.position.y, 0.9, dt * 4);
    for (const L of this.legs) { L.thigh.rotation.x = lerp(L.thigh.rotation.x, 0.15, dt * 5); L.shin.rotation.x = lerp(L.shin.rotation.x, -0.25, dt * 5); }
    this.spine.rotation.x = lerp(this.spine.rotation.x, -0.2, dt * 4);
    this.gunHolder.position.y = lerp(this.gunHolder.position.y, 0.1, dt * 3);
  }
  setLOD(level) {
    if (level === this.lodLevel) return;
    this.lodLevel = level;
    // nivel 2: ocultar detalles pequeños (bolsillos, gafas)
    this.root.traverse((o) => { if (o.isMesh && (o.geometry === G.pouch || o.geometry === G.glasses || o.geometry === G.goggles || o.geometry === G.brim)) o.visible = level < 2; if (o.isMesh) o.castShadow = level < 1; });
  }
}
const _tR = new THREE.Vector3(), _tL = new THREE.Vector3();
const _poleR = new THREE.Vector3(0.6, -0.8, 0.3).normalize();
const _poleL = new THREE.Vector3(-0.7, -0.6, 0.2).normalize();
