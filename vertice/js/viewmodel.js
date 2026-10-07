// Arma en primera persona: escena separada, brazos con IK, animaciones de
// balanceo, retroceso, recarga, cambio, sprint, apuntado y lanzamiento.
import * as THREE from './lib/three.module.min.js';
import { buildGun } from './gunmodel.js';
import { camoTexture } from './textures.js';
import { SKINS } from './data.js';
import { clamp, damp } from './util.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();

export class ViewModel {
  constructor(T, look) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4036, 1.2);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 2.5, 2);
    this.flashLight.position.set(0.1, -0.05, -0.6);
    this.scene.add(this.flashLight);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.gunPivot = new THREE.Group(); this.root.add(this.gunPivot);
    // brazos
    const skin = SKINS[look.skin] || SKINS.urbano;
    const camo = camoTexture({ id: 'skin_' + skin.id, colors: skin.colors, pattern: skin.pattern }, 128);
    this.sleeveMat = new THREE.MeshStandardMaterial({ map: camo, roughness: 0.9 });
    this.gloveMat = new THREE.MeshStandardMaterial({ color: 0x1c1d1e, roughness: 0.75 });
    const upperG = new THREE.CapsuleGeometry(0.045, 0.26, 3, 10); upperG.translate(0, -0.17, 0);
    const foreG = new THREE.CapsuleGeometry(0.04, 0.24, 3, 10); foreG.translate(0, -0.16, 0);
    const handG = new THREE.BoxGeometry(0.052, 0.085, 0.07); handG.translate(0, -0.33, 0);
    const cuffG = new THREE.CylinderGeometry(0.047, 0.047, 0.05, 10); cuffG.translate(0, -0.27, 0);
    this.arms = [];
    for (const s of [1, -1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.19, -0.34, 0.12); this.root.add(sh);
      sh.add(new THREE.Mesh(upperG, this.sleeveMat));
      const el = new THREE.Group(); el.position.y = -0.34; sh.add(el);
      el.add(new THREE.Mesh(foreG, this.sleeveMat)); el.add(new THREE.Mesh(handG, this.gloveMat)); el.add(new THREE.Mesh(cuffG, this.gloveMat));
      this.arms.push({ sh, el, a: 0.34, b: 0.33 });
    }
    // granada en mano
    this.nade = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 0.6, metalness: 0.3 }));
    this.nade.visible = false; this.root.add(this.nade);
    // fogonazo
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: T.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.flash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.32), this.flash.material);
    this.flash.renderOrder = 20; this.flash2.renderOrder = 20;
    this.flash.visible = this.flash2.visible = false;
    // casquillos
    this.shells = [];
    const shellG = new THREE.CylinderGeometry(0.005, 0.005, 0.025, 6); shellG.rotateZ(Math.PI / 2);
    const shellM = new THREE.MeshStandardMaterial({ color: 0xc9a043, metalness: 1, roughness: 0.3 });
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(shellG, shellM); m.visible = false; this.scene.add(m); this.shells.push({ m, v: new THREE.Vector3(), t: 0, r: new THREE.Vector3() }); }
    this.shellIdx = 0;
    // estado
    this.gun = null; this.def = null;
    this.ads = 0; this.sprint = 0; this.swayX = 0; this.swayY = 0; this.bob = 0; this.bobAmt = 0;
    this.kick = 0; this.kickRot = 0; this.kickSide = 0; this.flashT = 0;
    this.reloadT = -1; this.reloadDur = 1; this.reloadEmpty = false;
    this.switchT = -1; this.switchDur = 0.4; this.switchCb = null; this.raiseT = 1;
    this.throwT = -1; this.boltT = -1; this.landKick = 0; this.crouch = 0; this.inspect = 0;
    this.visible = true;
  }
  setWeapon(def, optic, camo) {
    if (this.gun) { this.gunPivot.remove(this.gun.group); this.gun.group.traverse((o) => { if (o.isMesh && o.geometry && o.material && o.material.map && o === this.gun.reticle) o.geometry.dispose(); }); }
    this.def = def;
    this.gun = buildGun(def, { optic, camo, detail: true });
    this.gunPivot.add(this.gun.group);
    this.gun.muzzle.add(this.flash); this.gun.muzzle.add(this.flash2);
    this.flash.position.set(0, 0, -0.04); this.flash2.position.set(0, 0, -0.08); this.flash2.rotation.x = Math.PI / 2;
    this.raiseT = 0;
    this.reloadT = -1; this.boltT = -1;
  }
  // animaciones disparadas
  fire(recoilMul = 1) {
    this.kick = Math.min(1.5, this.kick + 0.55 * recoilMul);
    this.kickRot = Math.min(1.5, this.kickRot + 0.6 * recoilMul);
    this.kickSide = (Math.random() - 0.5) * 0.6;
    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
    this.flashLight.intensity = 3.5;
    if (this.def && (this.def.model.type === 'sniper' || this.def.model.type === 'shotgun')) this.boltT = 0;
    if (this.def && this.def.model.type !== 'revolver' && this.def.model.type !== 'shotgun' && this.def.model.type !== 'sniper') this._ejectShell();
  }
  _ejectShell() {
    const s = this.shells[this.shellIdx++ % this.shells.length];
    s.m.visible = true; s.t = 0.6;
    this.gun.group.updateWorldMatrix(true, false);
    s.m.position.set(0.03, 0.03, -0.05).applyMatrix4(this.gun.group.matrixWorld);
    s.v.set(1.4 + Math.random() * 0.6, 1.2 + Math.random() * 0.6, 0.4);
    s.r.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
  }
  startReload(dur, empty) { this.reloadT = 0; this.reloadDur = dur; this.reloadEmpty = empty; }
  cancelReload() { this.reloadT = -1; }
  startSwitch(dur, cb) { this.switchT = 0; this.switchDur = dur; this.switchCb = cb; }
  startThrow() { this.throwT = 0; }
  land(v) { this.landKick = Math.min(1, v / 8); }

  _ik(arm, target, pole) {
    const S = arm.sh.position; const a = arm.a, b = arm.b;
    _v1.subVectors(target, S); let L = _v1.length();
    L = clamp(L, 0.05, a + b - 0.002); _v1.normalize();
    const cosA = clamp((a * a + L * L - b * b) / (2 * a * L), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    _v2.copy(pole).addScaledVector(_v1, -pole.dot(_v1)).normalize();
    const up = _v3.copy(_v1).multiplyScalar(cosA).addScaledVector(_v2, sinA).normalize();
    arm.sh.quaternion.setFromUnitVectors(DOWN, up);
    const elbow = _v2.copy(S).addScaledVector(up, a);
    const fore = _v1.subVectors(target, elbow).normalize();
    _q.copy(arm.sh.quaternion).invert(); fore.applyQuaternion(_q);
    arm.el.quaternion.setFromUnitVectors(DOWN, fore);
  }

  // st: {ads, sprint, moveSpeed, lookDX, lookDY, grounded, crouch, time}
  update(dt, st) {
    if (!this.gun) return;
    const def = this.def;
    this.ads = damp(this.ads, st.ads ? 1 : 0, 1 / Math.max(0.05, def.ads) * 2.6, dt);
    this.sprint = damp(this.sprint, st.sprint ? 1 : 0, 10, dt);
    this.crouch = damp(this.crouch, st.crouch ? 1 : 0, 8, dt);
    this.swayX = damp(this.swayX, clamp(-st.lookDX * 0.0018, -0.06, 0.06), 8, dt);
    this.swayY = damp(this.swayY, clamp(st.lookDY * 0.0018, -0.06, 0.06), 8, dt);
    const sp = st.moveSpeed;
    this.bobAmt = damp(this.bobAmt, st.grounded ? clamp(sp / 6, 0, 1.2) : 0, 8, dt);
    this.bob += dt * (6 + sp * 1.3);
    this.kick = damp(this.kick, 0, 14, dt); this.kickRot = damp(this.kickRot, 0, 10, dt);
    this.landKick = damp(this.landKick, 0, 6, dt);
    this.raiseT = Math.min(1, this.raiseT + dt / 0.35);
    // posición base (cadera) vs apuntado
    const A = this.ads * (1 - this.sprint);
    const pistol = this.gun.pistol;
    const hip = pistol ? _hipP.set(0.12, -0.13, -0.42) : _hip.set(0.15, -0.145, -0.43);
    const adsZ = def.scope ? -0.16 : (pistol ? -0.36 : -0.24 - (this.gun.sightZ || 0));
    const ads = _ads.set(0, -this.gun.sightY, adsZ);
    const p = this.gunPivot.position.lerpVectors(hip, ads, A);
    let rx = 0, ry = 0, rz = 0;
    const bobK = this.bobAmt * (1 - A * 0.85);
    p.x += Math.cos(this.bob * 0.5) * 0.012 * bobK + this.swayX * (1 - A * 0.7);
    p.y += -Math.abs(Math.sin(this.bob * 0.5)) * 0.012 * bobK + this.swayY * (1 - A * 0.7) - this.landKick * 0.04;
    // respiración
    const br = Math.sin(st.time * 1.6) * 0.002 * (1 - A * 0.6);
    p.y += br;
    // sprint
    const S = this.sprint;
    p.x += S * (pistol ? -0.02 : -0.05); p.y += S * -0.05; p.z += S * 0.04;
    rx += S * (pistol ? -0.5 : -0.25); ry += S * (pistol ? 0.1 : 0.75); rz += S * 0.25;
    p.x += Math.cos(this.bob * 0.5) * 0.03 * S * bobK; p.y += Math.sin(this.bob) * 0.02 * S * bobK;
    // agacharse: ligera inclinación
    rz += this.crouch * 0.06 * (1 - A);
    // retroceso
    p.z += this.kick * (def.scope ? 0.05 : 0.022) * (1 - A * 0.4);
    rx += this.kickRot * (pistol ? 0.16 : 0.07);
    ry += this.kickSide * this.kickRot * 0.04;
    // recarga
    let magOff = 0, leftToMag = 0;
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      const t = clamp(this.reloadT / this.reloadDur, 0, 1);
      const env = Math.sin(t * Math.PI);
      rx -= env * 0.35; rz += env * (pistol ? 0.5 : 0.7); p.y -= env * 0.05; p.x -= env * 0.03;
      if (t > 0.15 && t < 0.75) { magOff = Math.sin(((t - 0.15) / 0.6) * Math.PI); leftToMag = 1; }
      else if (t <= 0.15) leftToMag = t / 0.15; else leftToMag = Math.max(0, 1 - (t - 0.75) / 0.15);
      if (this.reloadEmpty && t > 0.82) { rx -= Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.15; }
      if (t >= 1) this.reloadT = -1;
    }
    if (this.gun.mag && this.gun.magHome) { this.gun.mag.position.copy(this.gun.magHome); this.gun.mag.position.y -= magOff * 0.22; this.gun.mag.position.z += magOff * 0.05; this.gun.mag.visible = magOff < 0.9; }
    // cerrojo / corredera
    if (this.boltT >= 0 && this.gun.bolt) {
      this.boltT += dt; const t = clamp(this.boltT / (def.model.type === 'sniper' ? 0.7 : 0.45), 0, 1);
      const k = Math.sin(t * Math.PI);
      this.gun.bolt.position.copy(this.gun.boltHome); this.gun.bolt.position.z += k * (def.model.type === 'sniper' ? 0.06 : 0.09);
      if (def.model.type === 'sniper') { rz += k * 0.15; this.gunPivot.position.y -= k * 0.01; }
      if (t >= 1) this.boltT = -1;
    } else if (this.gun.bolt && pistol) {
      this.gun.bolt.position.copy(this.gun.boltHome); this.gun.bolt.position.z += this.kick * 0.03;
    }
    // cambio de arma
    let lower = 0;
    if (this.switchT >= 0) {
      this.switchT += dt; const t = this.switchT / this.switchDur;
      lower = clamp(t * 2, 0, 1);
      if (t >= 0.5 && this.switchCb) { const cb = this.switchCb; this.switchCb = null; cb(); this.raiseT = 0; this.switchT = -1; }
    }
    lower = Math.max(lower, 1 - this.raiseT);
    // lanzar granada
    let throwK = 0;
    if (this.throwT >= 0) { this.throwT += dt; throwK = Math.sin(clamp(this.throwT / 0.55, 0, 1) * Math.PI); if (this.throwT > 0.55) this.throwT = -1; }
    lower = Math.max(lower, throwK * 0.8);
    p.y -= lower * 0.3; rx -= lower * 0.6;
    this.gunPivot.rotation.set(rx + this.swayY * 0.5, ry + this.swayX * 1.5, rz + this.swayX * 0.8);
    // brazos IK
    this.gunPivot.updateMatrix();
    const R = _tR.copy(this.gun.grip).applyMatrix4(this.gunPivot.matrix);
    const L = _tL.copy(this.gun.fore).applyMatrix4(this.gunPivot.matrix);
    if (leftToMag > 0 && this.gun.magHome) {
      const m = _tM.copy(this.gun.magHome); m.y -= magOff * 0.22 + 0.04; m.applyMatrix4(this.gunPivot.matrix);
      L.lerp(m, leftToMag);
    }
    this.nade.visible = throwK > 0.05;
    if (throwK > 0) {
      L.set(-0.15 + throwK * 0.05, -0.15 + throwK * 0.22, -0.28 - throwK * 0.1);
      this.nade.position.copy(L).add(_tM.set(0, 0.03, -0.02));
    }
    this.arms[1].sh.visible = true;
    this._ik(this.arms[0], R, _pR);
    this._ik(this.arms[1], L, _pL);
    // fogonazo
    this.flashT -= dt;
    const fl = this.flashT > 0;
    this.flash.visible = this.flash2.visible = fl && !def.scope;
    this.flashLight.intensity = damp(this.flashLight.intensity, 0, 30, dt);
    // casquillos
    for (const s of this.shells) {
      if (s.t <= 0) continue;
      s.t -= dt; s.v.y -= 9 * dt; s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.r.x * dt; s.m.rotation.y += s.r.y * dt;
      if (s.t <= 0) s.m.visible = false;
    }
    this.root.visible = this.visible;
  }
  // luz del arma alineada con el sol del mundo (en espacio de cámara)
  syncLights(worldCam, sunDir, sunColor, sunInt, hemiSky, hemiGround, hemiInt) {
    _q.copy(worldCam.quaternion).invert();
    _v1.copy(sunDir).applyQuaternion(_q);
    this.sun.position.copy(_v1).multiplyScalar(5); this.sun.target.position.set(0, 0, 0);
    this.sun.color.copy(sunColor); this.sun.intensity = sunInt * 0.9;
    this.hemi.color.copy(hemiSky); this.hemi.groundColor.copy(hemiGround); this.hemi.intensity = hemiInt * 1.1;
    // el "suelo" del hemisferio sigue al mundo
    _v2.set(0, 1, 0).applyQuaternion(_q); this.hemi.position.copy(_v2);
  }
  setAspect(a, fov) { this.camera.aspect = a; this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
}
const _hip = new THREE.Vector3(), _hipP = new THREE.Vector3(), _ads = new THREE.Vector3();
const _tR = new THREE.Vector3(), _tL = new THREE.Vector3(), _tM = new THREE.Vector3();
const _pR = new THREE.Vector3(0.5, -0.7, 0.4).normalize();
const _pL = new THREE.Vector3(-0.6, -0.7, 0.1).normalize();
