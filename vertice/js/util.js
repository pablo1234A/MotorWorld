// Utilidades matemáticas y helpers compartidos
export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const smooth = (t) => t * t * (3 - 2 * t);

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function angleTo(fromYaw, toYaw) { return wrapAngle(toYaw - fromYaw); }
// yaw convención: forward = (-sin(yaw), 0, -cos(yaw)) (como cámara three.js con rotación Y)
export function yawFromDir(dx, dz) { return Math.atan2(-dx, -dz); }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dirección con dispersión cónica (grados) alrededor de dir (Vector3 normalizado)
export function spreadDir(dir, deg, out, rnd = Math.random) {
  if (deg <= 0) return out.copy(dir);
  const r = Math.tan(deg * DEG) * Math.sqrt(rnd());
  const th = rnd() * Math.PI * 2;
  // base ortonormal
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dir.y) > 0.9) { ux = 1; uy = 0; }
  // right = dir x up
  let rx = dir.y * uz - dir.z * uy, ry = dir.z * ux - dir.x * uz, rz = dir.x * uy - dir.y * ux;
  const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
  // up2 = right x dir
  const vx = ry * dir.z - rz * dir.y, vy = rz * dir.x - rx * dir.z, vz = rx * dir.y - ry * dir.x;
  const a = Math.cos(th) * r, b = Math.sin(th) * r;
  out.set(dir.x + rx * a + vx * b, dir.y + ry * a + vy * b, dir.z + rz * a + vz * b).normalize();
  return out;
}

// Rayo contra esfera: devuelve t o -1
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  const t0 = tca - thc;
  return t0 >= 0 ? t0 : tca + thc;
}

// Distancia de punto a segmento (2D XZ)
export function pointSegDist2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const l2 = abx * abx + abz * abz;
  let t = l2 > 0 ? ((px - ax) * abx + (pz - az) * abz) / l2 : 0;
  t = clamp(t, 0, 1);
  const qx = ax + abx * t, qz = az + abz * t;
  return Math.hypot(px - qx, pz - qz);
}

export class Emitter {
  constructor() { this.h = {}; }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const a = this.h[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(ev, ...args) { const a = this.h[ev]; if (a) for (const fn of a.slice()) fn(...args); }
}

export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Heap binario mínimo (para A*)
export class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  clear() { this.k.length = 0; this.v.length = 0; }
  push(val, key) {
    const k = this.k, v = this.v; let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

// Vista lógica: si el móvil está en vertical, el juego se dibuja girado 90° en horizontal
export const view = {
  w: typeof window !== 'undefined' ? window.innerWidth : 1, h: typeof window !== 'undefined' ? window.innerHeight : 1, rot: false,
  toLocal(x, y) { return this.rot ? [y, window.innerWidth - x] : [x, y]; },
};
