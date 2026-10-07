// Soldado en tercera persona. Cada hueso es UNA malla fusionada que usa un atlas
// (camuflaje + muestras de color), así cada soldado cuesta ~12 draw calls.
// Animación procedural por código e IK de dos huesos para los brazos.
import * as THREE from './lib/three.module.min.js';
import { mergeGeometries } from './lib/BufferGeometryUtils.js';
import { SKINS, OPERATORS, WEAPONS } from './data.js';
import { buildGun } from './gunmodel.js';
import { clamp, lerp, mulberry32 } from './util.js';

// ------------------------------------------------------------ atlas
const SW = { vest: 0, gear: 1, helmet: 2, boot: 3, glove: 4, skin: 5, hair: 6, accent: 7, lens: 8, dark: 9 };
function swUV(i) { const c = i % 4, r = Math.floor(i / 4); return [(128 + 32 * c + 16) / 256, 1 - (32 * r + 16) / 128]; }

const atlasCache = new Map();
function atlasFor(look, accent) {
  const skin = SKINS[look.skin] || SKINS.urbano;
  const op = OPERATORS.find((o) => o.id === look.operator) || OPERATORS[0];
  const acc = '#' + new THREE.Color(accent).getHexString();
  const key = skin.id + '|' + op.id + '|' + acc;
  if (atlasCache.has(key)) return atlasCache.get(key);
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  // camuflaje procedural (mitad izquierda)
  const rnd = mulberry32(skin.id.length * 977 + skin.colors[0].charCodeAt(1));
  x.fillStyle = skin.colors[0]; x.fillRect(0, 0, 128, 128);
  const pat = skin.pattern;
  for (let i = 0; i < 70; i++) {
    x.fillStyle = skin.colors[1 + Math.floor(rnd() * (skin.colors.length - 1))];
    const px = rnd() * 128, py = rnd() * 128;
    if (pat === 'digital') { const s = 4 + Math.floor(rnd() * 3) * 4; for (let k = 0; k < 4; k++) x.fillRect(Math.floor((px + rnd() * 14) / 4) * 4, Math.floor((py + rnd() * 14) / 4) * 4, s, s); }
    else if (pat === 'tiger') { x.beginPath(); x.ellipse(px, py, 18 + rnd() * 20, 3 + rnd() * 4, rnd() * 0.5 - 0.25, 0, 7); x.fill(); }
    else { x.beginPath(); x.ellipse(px, py, 6 + rnd() * 12, 4 + rnd() * 9, rnd() * 3, 0, 7); x.fill(); }
  }
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; x.fillRect(rnd() * 128, rnd() * 128, 1, 1); }
  // muestras (mitad derecha)
  const dark = new THREE.Color(skin.colors[3] || skin.colors[1]).multiplyScalar(0.7);
  const cols = [];
  cols[SW.vest] = dark; cols[SW.gear] = new THREE.Color(skin.colors[1]).multiplyScalar(0.62);
  cols[SW.helmet] = new THREE.Color(skin.colors[1]).multiplyScalar(0.85); cols[SW.boot] = new THREE.Color(0x2a2219);
  cols[SW.glove] = new THREE.Color(0x1d1e1f); cols[SW.skin] = new THREE.Color(op.skin); cols[SW.hair] = new THREE.Color(op.hair);
  cols[SW.accent] = new THREE.Color(accent); cols[SW.lens] = new THREE.Color(0x0e1214); cols[SW.dark] = new THREE.Color(0x141516);
  for (let i = 0; i < 16; i++) {
    const col = cols[i] || cols[SW.dark];
    x.fillStyle = '#' + col.getHexString();
    x.fillRect(128 + 32 * (i % 4), 32 * Math.floor(i / 4), 32, 32);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.82, metalness: 0.05 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.1, roughness: 0.5 });
  const res = { mat, accentMat };
  atlasCache.set(key, res);
  return res;
}

// ------------------------------------------------------------ geometrías fusionadas por hueso
const BASE = {};
function base() {
  if (BASE.ready) return BASE;
  const B = BASE; B.ready = true;
  B.thigh = new THREE.CapsuleGeometry(0.085, 0.28, 3, 10); B.thigh.translate(0, -0.22, 0);
  B.knee = new THREE.SphereGeometry(0.07, 8, 6); B.knee.scale(1, 1, 0.8);
  B.shin = new THREE.CapsuleGeometry(0.066, 0.3, 3, 10); B.shin.translate(0, -0.21, 0);
  B.boot = new THREE.CapsuleGeometry(0.06, 0.15, 3, 8); B.boot.rotateX(Math.PI / 2); B.boot.scale(1.05, 0.85, 1); B.boot.translate(0, -0.455, -0.05);
  B.upper = new THREE.CapsuleGeometry(0.058, 0.2, 3, 8); B.upper.translate(0, -0.14, 0);
  B.fore = new THREE.CapsuleGeometry(0.05, 0.18, 3, 8); B.fore.translate(0, -0.13, 0);
  B.hand = new THREE.BoxGeometry(0.07, 0.09, 0.05); B.hand.translate(0, -0.3, 0);
  B.pelvis = new THREE.CapsuleGeometry(0.12, 0.12, 4, 10); B.pelvis.rotateZ(Math.PI / 2); B.pelvis.scale(1, 1, 0.9);
  B.belt = new THREE.CylinderGeometry(0.165, 0.165, 0.06, 14); B.belt.scale(1.05, 1, 0.8);
  B.chest = new THREE.CapsuleGeometry(0.17, 0.22, 4, 10); B.chest.scale(1.05, 1, 0.68);
  B.vest = new THREE.CapsuleGeometry(0.185, 0.17, 4, 12); B.vest.scale(1.1, 1, 0.78);
  B.plate = new THREE.BoxGeometry(0.3, 0.3, 0.05);
  B.pad = new THREE.SphereGeometry(0.075, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  B.pouch = new THREE.BoxGeometry(0.08, 0.1, 0.06);
  B.pack = new THREE.CapsuleGeometry(0.11, 0.18, 4, 8); B.pack.scale(1.15, 1, 0.65);
  B.neck = new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8);
  B.head = new THREE.SphereGeometry(0.112, 14, 10); B.head.scale(0.92, 1.05, 1);
  B.nose = new THREE.BoxGeometry(0.03, 0.04, 0.03);
  B.helmet = new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  B.cap = new THREE.SphereGeometry(0.122, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  B.brim = new THREE.BoxGeometry(0.16, 0.012, 0.1);
  B.beanie = new THREE.SphereGeometry(0.124, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58);
  B.hood = new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.7);
  B.goggles = new THREE.BoxGeometry(0.18, 0.05, 0.05);
  B.glasses = new THREE.BoxGeometry(0.17, 0.035, 0.03);
  B.mask = new THREE.BoxGeometry(0.17, 0.1, 0.08);
  B.gas = new THREE.CylinderGeometry(0.04, 0.05, 0.08, 10);
  B.band = new THREE.CylinderGeometry(0.066, 0.066, 0.05, 10);
  return B;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
// part: [geometry, swatch|-1(camo), x,y,z, rx,ry,rz, sx,sy,sz]
function mergeParts(parts) {
  const list = [];
  for (const [g0, sw, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1] of parts) {
    const g = g0.index ? g0.clone() : g0.clone();
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    const uv = g.attributes.uv;
    if (sw < 0) { for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.004 + uv.getX(i) * 0.49, uv.getY(i)); }
    else { const [u, v] = swUV(sw); for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v); }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    list.push(g.index ? g : g.toNonIndexed());
  }
  // asegurar que todas estén indexadas
  const norm = list.map((g) => { if (g.index) return g; const n = g.attributes.position.count; const idx = []; for (let i = 0; i < n; i++) idx.push(i); g.setIndex(idx); return g; });
  const m = mergeGeometries(norm, false);
  norm.forEach((g) => g.dispose());
  m.computeBoundingSphere();
  return m;
}

const geoCache = new Map();
function geometryFor(op, hg, fg, pack) {
  const key = op.id + hg + fg + pack;
  if (geoCache.has(key)) return geoCache.get(key);
  const B = base(); const b = op.build;
  const G = {};
  G.hips = mergeParts([[B.pelvis, -1, 0, 0, 0], [B.belt, SW.gear, 0, 0.08, 0]]);
  G.thighL = mergeParts([[B.thigh, -1, 0, 0, 0, 0, 0, 0, b, 1, b]]);
  G.thighR = mergeParts([[B.thigh, -1, 0, 0, 0, 0, 0, 0, b, 1, b], [B.pouch, SW.gear, 0.08, -0.15, 0]]);
  G.shin = mergeParts([[B.shin, -1], [B.boot, SW.boot], [B.knee, SW.vest, 0, -0.01, -0.05]]);
  const sp = [[B.chest, -1, 0, 0.3, 0, 0, 0, 0, b, 1, 1], [B.vest, SW.vest, 0, 0.31, 0, 0, 0, 0, b, 1, 1], [B.plate, SW.vest, 0, 0.33, -0.13], [B.neck, SW.skin, 0, 0.56, 0]];
  for (const x of [-0.09, 0, 0.09]) sp.push([B.pouch, SW.gear, x * b, 0.22, -0.16]);
  sp.push([B.pouch, SW.gear, 0.19 * b, 0.22, -0.02], [B.pouch, SW.gear, -0.19 * b, 0.22, -0.02]);
  if (pack) sp.push([B.pack, SW.gear, 0, 0.32, 0.17]);
  G.spine = mergeParts(sp);
  const hd = [[B.head, SW.skin], [B.nose, SW.skin, 0, -0.01, -0.11]];
  if (hg === 'helmet') hd.push([B.helmet, SW.helmet, 0, 0.01, 0.005], [B.goggles, SW.gear, 0, 0.07, -0.1, 0, 0, 0, 0.8, 0.6, 0.6]);
  else if (hg === 'cap') hd.push([B.cap, SW.gear, 0, 0.02, 0], [B.brim, SW.gear, 0, 0.04, -0.13]);
  else if (hg === 'beanie') hd.push([B.beanie, SW.gear, 0, 0.01, 0]);
  else if (hg === 'hood') hd.push([B.hood, -1, 0, -0.03, 0.02, 0.25]);
  else hd.push([B.cap, SW.hair, 0, 0.01, 0.01]);
  if (fg === 'glasses') hd.push([B.glasses, SW.lens, 0, 0.02, -0.1]);
  else if (fg === 'goggles') hd.push([B.goggles, SW.lens, 0, 0.03, -0.1]);
  else if (fg === 'balaclava') hd.push([B.mask, SW.vest, 0, -0.04, -0.06, 0, 0, 0, 1.05, 1.2, 1.2]);
  else if (fg === 'mask') hd.push([B.mask, SW.vest, 0, -0.05, -0.07]);
  else if (fg === 'gasmask') hd.push([B.mask, SW.gear, 0, -0.03, -0.07], [B.gas, SW.vest, 0, -0.06, -0.14, Math.PI / 2], [B.goggles, SW.lens, 0, 0.03, -0.1]);
  G.head = mergeParts(hd);
  G.upper = mergeParts([[B.upper, -1], [B.pad, SW.vest, 0, 0, 0, 0, 0, 0, 1, 0.9, 1]]);
  G.upperL = mergeParts([[B.upper, -1], [B.pad, SW.vest, 0, 0, 0, 0, 0, 0, 1, 0.9, 1], [B.band, SW.accent, 0, -0.08, 0]]);
  G.fore = mergeParts([[B.fore, -1], [B.hand, SW.glove]]);
  geoCache.set(key, G);
  return G;
}

// arma en tercera persona: una sola malla con colores planos
const gunGeoCache = new Map();
const gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 });
function gunMesh(id) {
  let g = gunGeoCache.get(id);
  if (!g) {
    const info = buildGun(WEAPONS[id] || WEAPONS.vx9, { detail: false, optic: (WEAPONS[id] || {}).scope ? 'scope' : 'iron' });
    info.group.updateMatrixWorld(true);
    const parts = [];
    info.group.traverse((o) => {
      if (!o.isMesh) return;
      const gg = o.geometry.clone().applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(gg.attributes)) if (!['position', 'normal'].includes(k)) gg.deleteAttribute(k);
      const n = gg.attributes.position.count; const col = new Float32Array(n * 3);
      const c = o.material.color || new THREE.Color(0x222222);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(gg.index ? gg.toNonIndexed() : gg);
    });
    g = { geo: mergeGeometries(parts, false), grip: info.grip.clone(), fore: info.fore.clone(), magHome: info.magHome ? info.magHome.clone() : null, pistol: !!info.pistol };
    parts.forEach((p) => p.dispose());
    gunGeoCache.set(id, g);
  }
  return g;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _qq = new THREE.Quaternion();

export class Soldier {
  // look: {operator, skin, headgear, facegear, backpack}; accent: color hex del equipo
  constructor(look, accent, weaponId, opts = {}) {
    this.look = look;
    const op = OPERATORS.find((o) => o.id === look.operator) || OPERATORS[0];
    const hg = look.headgear && look.headgear !== 'default' ? look.headgear : op.head;
    const fg = look.facegear && look.facegear !== 'default' ? look.facegear : op.face;
    const G = geometryFor(op, hg, fg, look.backpack !== false);
    const { mat } = atlasFor(look, accent);
    const shadow = opts.shadow !== false;
    this.meshes = [];
    const mk = (geo, parent) => { const o = new THREE.Mesh(geo, mat); o.castShadow = shadow; o.receiveShadow = false; parent.add(o); this.meshes.push(o); return o; };
    const root = this.root = new THREE.Group();
    this.body = new THREE.Group(); this.body.scale.setScalar(op.build > 1 ? 1.0 : 0.97); root.add(this.body);
    const hips = this.hips = new THREE.Group(); hips.position.y = 0.95; this.body.add(hips);
    mk(G.hips, hips);
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(s * 0.1, -0.04, 0); hips.add(thigh);
      mk(s === 1 ? G.thighR : G.thighL, thigh);
      const shin = new THREE.Group(); shin.position.y = -0.45; thigh.add(shin);
      mk(G.shin, shin);
      this.legs.push({ thigh, shin });
    }
    const spine = this.spine = new THREE.Group(); spine.position.y = 0.06; hips.add(spine);
    mk(G.spine, spine);
    const head = this.head = new THREE.Group(); head.position.set(0, 0.68, 0); spine.add(head);
    mk(G.head, head);
    this.arms = [];
    for (const s of [1, -1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.21 * op.build, 0.47, 0); spine.add(sh);
      mk(s === -1 ? G.upperL : G.upper, sh);
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      mk(G.fore, el);
      this.arms.push({ sh, el, side: s });
    }
    this.gunHolder = new THREE.Group(); spine.add(this.gunHolder);
    this.gunObj = new THREE.Mesh(undefined, gunMat); this.gunObj.castShadow = shadow; this.gunHolder.add(this.gunObj); this.meshes.push(this.gunObj);
    this.setWeapon(weaponId);
    this.phase = 0; this.crouchT = 0; this.flinch = 0; this.recoil = 0; this.reloadT = -1; this.reloadDur = 1;
    this.dead = false; this.deathT = 0; this.deathDir = 1; this.aimPitch = 0; this.speed = 0; this.throwT = -1;
    this.lodLevel = 0;
  }
  setWeapon(id) {
    const g = gunMesh(id);
    this.gunObj.geometry = g.geo;
    this.gun = g;
    this.pistol = g.pistol;
  }
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
    _qq.copy(arm.sh.quaternion).invert(); fore.applyQuaternion(_qq);
    arm.el.quaternion.setFromUnitVectors(DOWN, fore);
  }
  // st: {speed, crouch, aimPitch, sprint, grounded}
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
    const gh = this.gunHolder;
    let gx = 0.1, gy = 0.38, gz = -0.32, rx = -this.aimPitch * 0.45, ry = 0, rz = 0;
    if (st.idle) this.aimPitch = 0;
    if (this.pistol) { gx = 0.0; gy = 0.4; gz = -0.42; }
    if (st.sprint) { gx = 0.05; gy = 0.3; gz = -0.25; rx = -0.6; ry = 0.6; }
    if (st.idle) { gx = 0.06; gy = 0.24; gz = -0.26; rx = -0.75; ry = 0.35; rz = -0.1; }
    gz += this.recoil * 0.05; rx += this.recoil * 0.12;
    if (this.reloadT >= 0) {
      this.reloadT += dt; const k = Math.sin(clamp(this.reloadT / this.reloadDur, 0, 1) * Math.PI);
      rx -= k * 0.5; rz = k * 0.4; gy -= k * 0.06;
      if (this.reloadT > this.reloadDur) this.reloadT = -1;
    }
    if (this.throwT >= 0) { this.throwT += dt; const k = Math.sin(clamp(this.throwT / 0.5, 0, 1) * Math.PI); gy -= k * 0.15; rx -= k * 0.8; if (this.throwT > 0.5) this.throwT = -1; }
    gh.position.set(gx, gy, gz); gh.rotation.set(rx, ry, rz);
    gh.updateMatrix();
    const right = _tR.copy(this.gun.grip).applyMatrix4(gh.matrix);
    const left = _tL.copy(this.gun.fore).applyMatrix4(gh.matrix);
    if (this.reloadT >= 0 && this.gun.magHome) { left.copy(this.gun.magHome).applyMatrix4(gh.matrix); left.y -= 0.05 * Math.sin(this.reloadT * 6); }
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
    for (const m of this.meshes) m.castShadow = level < 1;
  }
}
const _tR = new THREE.Vector3(), _tL = new THREE.Vector3();
const _poleR = new THREE.Vector3(0.6, -0.8, 0.3).normalize();
const _poleL = new THREE.Vector3(-0.7, -0.6, 0.2).normalize();
