// Efectos visuales con pools: partículas (2 draw calls), trazadoras, calcomanías,
// fogonazos, explosiones, humo (que bloquea la visión de la IA), fuego y lluvia en GPU.
import * as THREE from './lib/three.module.min.js';
import { rand, clamp } from './util.js';

const PVS = `
attribute float size; attribute float alpha; attribute vec3 tint;
varying float vA; varying vec3 vC;
uniform float uScale;
void main(){
  vA = alpha; vC = tint;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const PFS = `
uniform sampler2D map; varying float vA; varying vec3 vC;
void main(){
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vC * t.rgb, t.a * vA);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}`;

class PointPool {
  constructor(n, map, additive) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.tint = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.grow = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.a0 = new Float32Array(n); this.fadeIn = new Float32Array(n);
    this.next = 0; this.active = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1); this.aSize.setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1); this.aAlpha.setUsage(THREE.DynamicDrawUsage);
    this.aTint = new THREE.BufferAttribute(this.tint, 3); this.aTint.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('size', this.aSize); g.setAttribute('alpha', this.aAlpha); g.setAttribute('tint', this.aTint);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uScale: { value: 400 } }, vertexShader: PVS, fragmentShader: PFS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
  }
  spawn(x, y, z, vx, vy, vz, size, life, r, g, b, a = 1, grow = 0, grav = 0, drag = 0, fadeIn = 0) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.size[i] = size; this.life[i] = life; this.max[i] = life; this.tint[i3] = r; this.tint[i3 + 1] = g; this.tint[i3 + 2] = b;
    this.a0[i] = a; this.alpha[i] = fadeIn > 0 ? 0 : a; this.grow[i] = grow; this.grav[i] = grav; this.drag[i] = drag; this.fadeIn[i] = fadeIn;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; any = true; } continue; }
      any = true;
      this.life[i] -= dt;
      const i3 = i * 3;
      const d = 1 - Math.min(1, this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02 && this.grav[i] > 0) { this.pos[i3 + 1] = 0.02; this.vel[i3 + 1] *= -0.3; this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6; }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.max[i];
      const age = this.max[i] - this.life[i];
      let a = this.a0[i] * Math.min(1, t * 2.5);
      if (this.fadeIn[i] > 0) a *= Math.min(1, age / this.fadeIn[i]);
      this.alpha[i] = Math.max(0, a);
    }
    if (any) { this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true; this.aTint.needsUpdate = true; }
  }
}

export class Effects {
  constructor(scene, T, Q, atmos) {
    this.scene = scene; this.T = T; this.Q = Q;
    const n = Q.particles;
    this.add = new PointPool(Math.floor(n * 0.45), T.glow, true);
    this.alp = new PointPool(Math.floor(n * 0.55) + 200, T.smoke, false);
    scene.add(this.add.points, this.alp.points);
    this.smokeTint = atmos === 'storm' ? [0.55, 0.57, 0.6] : atmos === 'dusk' ? [0.75, 0.68, 0.62] : atmos === 'dawn' ? [0.68, 0.72, 0.78] : [0.78, 0.78, 0.76];
    // trazadoras
    this.tracers = [];
    const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0, -0.5);
    const tm = new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 36; i++) { const m = new THREE.Mesh(tg, tm); m.visible = false; m.frustumCulled = false; scene.add(m); this.tracers.push({ m, from: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, travel: 0, speed: 0, len: 0 }); }
    this.tracerIdx = 0;
    // calcomanías (impactos)
    const dg = new THREE.PlaneGeometry(1, 1);
    this.holeMesh = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ map: T.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 1 }), Q.decals);
    this.scorchMesh = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ map: T.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, roughness: 1 }), 16);
    for (const im of [this.holeMesh, this.scorchMesh]) { im.frustumCulled = false; im.receiveShadow = true; const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < im.count; i++) im.setMatrixAt(i, z); scene.add(im); }
    this.holeIdx = 0; this.scorchIdx = 0;
    // luces dinámicas (siempre presentes para evitar recompilar shaders)
    this.lights = [];
    const nl = Q.id === 'low' ? 0 : 2;
    for (let i = 0; i < nl; i++) { const l = new THREE.PointLight(0xffa050, 0, 18, 2); l.castShadow = false; scene.add(l); this.lights.push({ l, t: 0, max: 0, peak: 0 }); }
    this.lightIdx = 0;
    // humo táctico
    this.smokes = [];
    // fuegos permanentes
    this.fires = [];
    this.timeAcc = 0;
    // lluvia
    this.rain = null;
    if (atmos === 'storm') this._makeRain(Q.rain);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._v = new THREE.Vector3(); this._n = new THREE.Vector3();
  }
  setScale(px) { this.add.mat.uniforms.uScale.value = px; this.alp.mat.uniforms.uScale.value = px; }

  _makeRain(n) {
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = rand(-25, 25), y = rand(0, 22), z = rand(-25, 25);
      pos.set([x, y, z, x, y, z], i * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ends = new Float32Array(n * 2); for (let i = 0; i < n; i++) { ends[i * 2] = 0; ends[i * 2 + 1] = 1; }
    g.setAttribute('endp', new THREE.BufferAttribute(ends, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } },
      vertexShader: `attribute float endp; uniform float uTime; uniform vec3 uCam; varying float vE;
        void main(){ vec3 p = position; float y = mod(p.y - uTime*16.0, 22.0); vec3 w = vec3(uCam.x + mod(p.x - uCam.x + 25.0, 50.0) - 25.0, uCam.y - 6.0 + y, uCam.z + mod(p.z - uCam.z + 25.0, 50.0) - 25.0);
        w += vec3(0.25, 0.9, 0.08) * endp * 0.55; vE = endp; gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0); }`,
      fragmentShader: `varying float vE; void main(){ gl_FragColor = vec4(0.7,0.75,0.8, 0.22 * (1.0 - vE*0.6)); }`,
      transparent: true, depthWrite: false,
    });
    this.rain = new THREE.LineSegments(g, mat); this.rain.frustumCulled = false; this.scene.add(this.rain);
  }

  flashLight(pos, color, peak, dur, dist = 18) {
    if (!this.lights.length) return;
    const L = this.lights[this.lightIdx++ % this.lights.length];
    L.l.position.copy(pos); L.l.color.setHex(color); L.l.distance = dist; L.peak = peak; L.t = dur; L.max = dur; L.l.intensity = peak;
  }

  tracer(from, to, speed = 380, color) {
    const T = this.tracers[this.tracerIdx++ % this.tracers.length];
    T.from.copy(from); T.dir.subVectors(to, from); T.dist = T.dir.length(); if (T.dist < 1) return; T.dir.divideScalar(T.dist);
    T.travel = 0; T.speed = speed; T.len = Math.min(5, T.dist * 0.3);
    T.m.visible = true;
    T.m.position.copy(from); T.m.lookAt(to); T.m.scale.set(0.022, 0.022, T.len);
  }

  muzzle(pos, dir, big = 1) {
    this.add.spawn(pos.x, pos.y, pos.z, dir.x * 2, dir.y * 2, dir.z * 2, 0.55 * big, 0.06, 1.0, 0.75, 0.4, 1);
    this.add.spawn(pos.x + dir.x * 0.2, pos.y + dir.y * 0.2, pos.z + dir.z * 0.2, dir.x * 6, dir.y * 6, dir.z * 6, 0.35 * big, 0.05, 1.0, 0.6, 0.25, 0.9);
    this.alp.spawn(pos.x, pos.y, pos.z, dir.x * 1.5 + rand(-0.3, 0.3), dir.y * 1.5 + 0.4, dir.z * 1.5 + rand(-0.3, 0.3), 0.25, 0.6, ...this.smokeTint, 0.12, 0.8, -0.2, 2);
  }

  impact(p, n, mat) {
    const [sr, sg, sb] = this.smokeTint;
    if (mat === 'metal') {
      for (let i = 0; i < 6; i++) this.add.spawn(p.x, p.y, p.z, n.x * 3 + rand(-3, 3), n.y * 3 + rand(-1, 4), n.z * 3 + rand(-3, 3), 0.06, rand(0.15, 0.35), 1, 0.8, 0.45, 1, -0.1, 9.8, 1);
      this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.3, 0.05, 1, 0.9, 0.7, 1);
    } else if (mat === 'body') {
      for (let i = 0; i < 4; i++) this.alp.spawn(p.x, p.y, p.z, rand(-0.8, 0.8), rand(-0.2, 0.8), rand(-0.8, 0.8), 0.18, 0.35, 0.35, 0.33, 0.3, 0.45, 0.5, 0, 3);
      this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.2, 0.06, 1, 0.85, 0.7, 0.8);
      return;
    } else if (mat === 'glass') {
      for (let i = 0; i < 10; i++) this.add.spawn(p.x, p.y, p.z, rand(-2, 2), rand(-1, 2), rand(-2, 2), 0.05, rand(0.3, 0.7), 0.7, 0.85, 0.95, 0.9, 0, 9.8, 0.5);
    } else if (mat === 'wood') {
      for (let i = 0; i < 5; i++) this.alp.spawn(p.x, p.y, p.z, n.x * 2 + rand(-1.5, 1.5), n.y * 2 + rand(0, 2), n.z * 2 + rand(-1.5, 1.5), 0.06, rand(0.4, 0.8), 0.45, 0.33, 0.2, 1, 0, 9.8, 1);
    }
    // polvo
    const dust = mat === 'dirt' || mat === 'ground' ? [0.55, 0.48, 0.38] : [sr * 0.95, sg * 0.93, sb * 0.9];
    for (let i = 0; i < 3; i++) this.alp.spawn(p.x + n.x * 0.05, p.y + n.y * 0.05, p.z + n.z * 0.05, n.x * rand(0.5, 1.6) + rand(-0.3, 0.3), n.y * rand(0.5, 1.6) + rand(0, 0.5), n.z * rand(0.5, 1.6) + rand(-0.3, 0.3), rand(0.12, 0.25), rand(0.4, 0.9), ...dust, 0.5, 0.7, 0.3, 2.5);
    for (let i = 0; i < 3; i++) this.alp.spawn(p.x, p.y, p.z, n.x * 3 + rand(-2, 2), n.y * 3 + rand(0, 3), n.z * 3 + rand(-2, 2), 0.035, rand(0.3, 0.6), dust[0] * 0.6, dust[1] * 0.6, dust[2] * 0.6, 1, 0, 9.8, 0.5);
    if (mat !== 'glass') this.decal(p, n, rand(0.07, 0.11));
  }

  decal(p, n, size) {
    const m = this._m, q = this._q;
    this._n.set(n.x, n.y, n.z);
    q.setFromUnitVectors(_Z, this._n);
    const rq = _rq.setFromAxisAngle(_Z, Math.random() * Math.PI * 2); q.multiply(rq);
    this._v.set(p.x + n.x * 0.01, p.y + n.y * 0.01, p.z + n.z * 0.01);
    this._s.set(size, size, size);
    m.compose(this._v, q, this._s);
    this.holeMesh.setMatrixAt(this.holeIdx++ % this.holeMesh.count, m);
    this.holeMesh.instanceMatrix.needsUpdate = true;
  }
  scorch(p, size) {
    const m = this._m, q = this._q;
    q.setFromUnitVectors(_Z, _UP); q.multiply(_rq.setFromAxisAngle(_Z, Math.random() * 6.28));
    this._v.set(p.x, 0.04, p.z); this._s.set(size, size, size);
    m.compose(this._v, q, this._s);
    this.scorchMesh.setMatrixAt(this.scorchIdx++ % this.scorchMesh.count, m);
    this.scorchMesh.instanceMatrix.needsUpdate = true;
  }

  explosion(p, scale = 1) {
    const s = scale;
    this.flashLight(_tv.set(p.x, p.y + 1, p.z), 0xff9a40, 60 * s, 0.35, 22 * s);
    this.add.spawn(p.x, p.y + 0.3, p.z, 0, 0, 0, 6 * s, 0.12, 1, 0.9, 0.7, 1, 30 * s);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.28, r = rand(0.5, 4) * s;
      this.add.spawn(p.x, p.y + 0.4, p.z, Math.cos(a) * r, rand(1, 4) * s, Math.sin(a) * r, rand(1.2, 2.6) * s, rand(0.25, 0.55), 1, rand(0.45, 0.7), 0.15, 0.9, 3 * s, -1, 2);
    }
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * 6.28, r = rand(6, 16) * s;
      this.add.spawn(p.x, p.y + 0.3, p.z, Math.cos(a) * r, rand(3, 12) * s, Math.sin(a) * r, 0.08, rand(0.4, 1.1), 1, 0.7, 0.3, 1, -0.05, 9.8, 0.6);
    }
    const [sr, sg, sb] = this.smokeTint;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.28, r = rand(0.5, 3.5) * s;
      this.alp.spawn(p.x + Math.cos(a) * 0.5, p.y + rand(0.3, 1.5), p.z + Math.sin(a) * 0.5, Math.cos(a) * r, rand(0.8, 3) * s, Math.sin(a) * r, rand(1.5, 3) * s, rand(2.5, 4.5), sr * 0.45, sg * 0.43, sb * 0.42, 0.75, 1.6 * s, -0.25, 1.2, 0.15);
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.28, r = rand(3, 9) * s;
      this.alp.spawn(p.x, p.y + 0.3, p.z, Math.cos(a) * r, rand(2, 7) * s, Math.sin(a) * r, rand(0.06, 0.12), rand(0.8, 1.4), 0.15, 0.13, 0.11, 1, 0, 9.8, 0.3);
    }
    // anillo de polvo
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * 6.28;
      this.alp.spawn(p.x, 0.3, p.z, Math.cos(a) * 7 * s, 0.3, Math.sin(a) * 7 * s, 1.2 * s, rand(1, 1.8), 0.55, 0.5, 0.42, 0.55, 2 * s, 0, 2.5);
    }
    if (p.y < 1.5) this.scorch(p, 3.5 * s);
  }

  smokeGrenade(p, dur = 14, r = 5.5) {
    const s = { pos: p.clone(), r: 0.5, maxR: r, t: 0, dur, emit: 0 };
    this.smokes.push(s);
    return s;
  }
  flashbang(p) {
    this.flashLight(_tv.set(p.x, p.y + 0.5, p.z), 0xffffff, 90, 0.25, 25);
    this.add.spawn(p.x, p.y + 0.2, p.z, 0, 0, 0, 7, 0.15, 1, 1, 1, 1, 20);
    for (let i = 0; i < 16; i++) this.add.spawn(p.x, p.y + 0.2, p.z, rand(-8, 8), rand(0, 8), rand(-8, 8), 0.08, rand(0.3, 0.7), 1, 1, 0.9, 1, 0, 9.8, 1);
    for (let i = 0; i < 6; i++) this.alp.spawn(p.x, p.y + 0.3, p.z, rand(-1, 1), rand(0.3, 1.2), rand(-1, 1), 1.2, 2, 0.85, 0.85, 0.85, 0.5, 0.8, 0, 1);
  }
  debris(p, kind) {
    const c = kind === 'crate' ? [0.5, 0.36, 0.22] : [0.7, 0.8, 0.9];
    for (let i = 0; i < 18; i++) this.alp.spawn(p.x + rand(-0.4, 0.4), p.y + rand(-0.3, 0.4), p.z + rand(-0.4, 0.4), rand(-3, 3), rand(1, 5), rand(-3, 3), rand(0.06, 0.16), rand(0.6, 1.4), c[0], c[1], c[2], 1, 0, 9.8, 0.4);
    for (let i = 0; i < 5; i++) this.alp.spawn(p.x, p.y, p.z, rand(-1, 1), rand(0, 1), rand(-1, 1), 0.6, 1.2, 0.6, 0.55, 0.5, 0.4, 1, 0, 2);
  }
  addFire(x, y, z, s = 1) { this.fires.push({ x, y, z, s, acc: 0 }); }

  // ¿bloquea el humo el segmento a-b?
  smokeBlocks(ax, ay, az, bx, by, bz) {
    for (const s of this.smokes) {
      if (s.r < 1.5) continue;
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const L2 = dx * dx + dy * dy + dz * dz;
      let t = ((s.pos.x - ax) * dx + (s.pos.y + 1.2 - ay) * dy + (s.pos.z - az) * dz) / (L2 || 1);
      t = clamp(t, 0, 1);
      const qx = ax + dx * t - s.pos.x, qy = ay + dy * t - (s.pos.y + 1.2), qz = az + dz * t - s.pos.z;
      if (qx * qx + qy * qy * 0.5 + qz * qz < s.r * s.r * 0.8) return true;
    }
    return false;
  }
  smokeDensityAt(p) {
    let d = 0;
    for (const s of this.smokes) {
      const dx = p.x - s.pos.x, dy = (p.y - s.pos.y - 1.2) * 0.7, dz = p.z - s.pos.z;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r < s.r) d = Math.max(d, 1 - r / s.r);
    }
    return d;
  }

  update(dt, cam, time) {
    this.add.update(dt); this.alp.update(dt);
    for (const T of this.tracers) {
      if (!T.m.visible) continue;
      T.travel += T.speed * dt;
      if (T.travel >= T.dist) { T.m.visible = false; continue; }
      T.m.position.copy(T.from).addScaledVector(T.dir, T.travel);
      T.m.scale.z = Math.min(T.len, T.dist - T.travel);
    }
    for (const L of this.lights) { if (L.t > 0) { L.t -= dt; L.l.intensity = L.peak * Math.max(0, L.t / L.max); } else L.l.intensity = 0; }
    // humo táctico
    const [sr, sg, sb] = this.smokeTint;
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i]; s.t += dt;
      const life = s.t / s.dur;
      s.r = life < 0.15 ? s.maxR * (life / 0.15) : life > 0.85 ? s.maxR * Math.max(0, (1 - life) / 0.15) : s.maxR;
      s.emit += dt;
      if (life < 0.9 && s.emit > 0.09) {
        s.emit = 0;
        for (let k = 0; k < 2; k++) {
          const a = Math.random() * 6.28, r = Math.random() * s.r * 0.8;
          this.alp.spawn(s.pos.x + Math.cos(a) * r, s.pos.y + rand(0.2, 2.6), s.pos.z + Math.sin(a) * r, rand(-0.3, 0.3), rand(0.05, 0.3), rand(-0.3, 0.3), rand(2.5, 4), rand(3, 4.5), sr * 1.05, sg * 1.05, sb * 1.05, 0.55, 0.35, 0, 0.3, 0.6);
        }
      }
      if (s.t > s.dur) this.smokes.splice(i, 1);
    }
    // fuegos
    for (const f of this.fires) {
      f.acc += dt;
      if (f.acc < 0.07) continue;
      f.acc = 0;
      const d2 = (f.x - cam.position.x) ** 2 + (f.z - cam.position.z) ** 2;
      if (d2 > 90 * 90) continue;
      this.add.spawn(f.x + rand(-0.4, 0.4) * f.s, f.y + rand(0, 0.3), f.z + rand(-0.4, 0.4) * f.s, rand(-0.2, 0.2), rand(1, 2), rand(-0.2, 0.2), rand(0.6, 1.0) * f.s, rand(0.4, 0.8), 1, rand(0.4, 0.6), 0.12, 0.8, -0.6, -1, 1);
      if (Math.random() < 0.5) this.alp.spawn(f.x, f.y + 1.2 * f.s, f.z, rand(-0.3, 0.3) + 0.4, rand(1.2, 2), rand(-0.3, 0.3), rand(1, 1.6) * f.s, rand(3, 5), 0.12, 0.11, 0.1, 0.5, 1.2, -0.1, 0.2, 0.5);
    }
    if (this.rain) { this.rain.material.uniforms.uTime.value = time; this.rain.material.uniforms.uCam.value.copy(cam.position); }
  }
  dispose() {
    this.scene.remove(this.add.points, this.alp.points, this.holeMesh, this.scorchMesh);
    this.add.points.geometry.dispose(); this.alp.points.geometry.dispose(); this.add.mat.dispose(); this.alp.mat.dispose();
    for (const T of this.tracers) this.scene.remove(T.m);
    this.tracers[0].m.geometry.dispose(); this.tracers[0].m.material.dispose();
    for (const L of this.lights) this.scene.remove(L.l);
    if (this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); this.rain.material.dispose(); }
    this.holeMesh.dispose(); this.scorchMesh.dispose();
  }
}
const _Z = new THREE.Vector3(0, 0, 1), _UP = new THREE.Vector3(0, 1, 0), _rq = new THREE.Quaternion(), _tv = new THREE.Vector3();
