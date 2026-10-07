// Navegación 2.5D: rejilla de 1 m construida por inundación desde semillas,
// A* con coste extra opcional (para flanqueos) y puntos de cobertura automáticos.
import { MinHeap } from './util.js';

const STEP = 0.72; // diferencia de altura máxima entre celdas vecinas
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Nav {
  constructor(world, minX, minZ, maxX, maxZ, cell = 1) {
    this.world = world; this.cell = cell;
    this.minX = minX; this.minZ = minZ;
    this.nx = Math.ceil((maxX - minX) / cell); this.nz = Math.ceil((maxZ - minZ) / cell);
    const N = this.nx * this.nz;
    this.walk = new Uint8Array(N);
    this.floor = new Float32Array(N);
    this.links = new Uint8Array(N);
    this.gScore = new Float32Array(N);
    this.parent = new Int32Array(N);
    this.seen = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.gen = 1;
    this.heap = new MinHeap();
    this.cover = [];
    this.walkList = [];
  }
  idx(x, z) {
    const ix = Math.floor((x - this.minX) / this.cell), iz = Math.floor((z - this.minZ) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    return iz * this.nx + ix;
  }
  cx(i) { return this.minX + ((i % this.nx) + 0.5) * this.cell; }
  cz(i) { return this.minZ + (Math.floor(i / this.nx) + 0.5) * this.cell; }

  _floorCandidate(x, z, f) {
    const q = _q;
    this.world.query(x - 0.05, f - 0.75, z - 0.05, x + 0.05, f + STEP, z + 0.05, q);
    let best = -Infinity;
    for (const b of q) {
      if (!b.solid) continue;
      const top = b.max[1];
      if (top <= f + STEP && top >= f - 0.75 && top > best) best = top;
    }
    if (best === -Infinity) { if (f <= 0.75) best = 0; else return null; }
    return best;
  }
  _clear(x, z, f) {
    return !this.world.overlapsSolid(x - 0.3, f + 0.36, z - 0.3, x + 0.3, f + 1.75, z + 0.3);
  }

  build(seeds) {
    const N = this.nx * this.nz;
    const visited = new Uint8Array(N);
    const queue = new Int32Array(N); let qh = 0, qt = 0;
    for (const s of seeds) {
      const i = this.idx(s.x, s.z); if (i < 0 || visited[i]) continue;
      const f = this._floorCandidate(this.cx(i), this.cz(i), s.y || 0);
      if (f === null || !this._clear(this.cx(i), this.cz(i), f)) continue;
      visited[i] = 1; this.walk[i] = 1; this.floor[i] = f; queue[qt++] = i;
    }
    while (qh < qt) {
      const i = queue[qh++];
      const ix = i % this.nx, iz = Math.floor(i / this.nx); const f = this.floor[i];
      for (let d = 0; d < 4; d++) {
        const jx = ix + DIRS[d][0], jz = iz + DIRS[d][1];
        if (jx < 1 || jz < 1 || jx >= this.nx - 1 || jz >= this.nz - 1) continue;
        const j = jz * this.nx + jx;
        if (visited[j]) continue;
        const x = this.cx(j), z = this.cz(j);
        const nf = this._floorCandidate(x, z, f);
        if (nf === null || Math.abs(nf - f) > STEP) continue;
        if (!this._clear(x, z, nf)) continue;
        visited[j] = 1; this.walk[j] = 1; this.floor[j] = nf; queue[qt++] = j;
      }
    }
    // enlaces
    for (let i = 0; i < N; i++) {
      if (!this.walk[i]) continue;
      this.walkList.push(i);
      const ix = i % this.nx, iz = Math.floor(i / this.nx); let m = 0;
      for (let d = 0; d < 8; d++) {
        const jx = ix + DIRS[d][0], jz = iz + DIRS[d][1];
        if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
        const j = jz * this.nx + jx;
        if (!this.walk[j] || Math.abs(this.floor[j] - this.floor[i]) > STEP) continue;
        if (d >= 4) {
          const a = iz * this.nx + jx, b = jz * this.nx + ix;
          if (!this.walk[a] || !this.walk[b]) continue;
          if (Math.abs(this.floor[a] - this.floor[i]) > STEP || Math.abs(this.floor[b] - this.floor[i]) > STEP) continue;
        }
        m |= 1 << d;
      }
      this.links[i] = m;
    }
    this._buildCover();
  }

  _buildCover() {
    const taken = new Set();
    for (const i of this.walkList) {
      const ix = i % this.nx, iz = Math.floor(i / this.nx); const f = this.floor[i];
      for (let d = 0; d < 4; d++) {
        const jx = ix + DIRS[d][0], jz = iz + DIRS[d][1];
        const j = jz * this.nx + jx;
        if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
        if (this.walk[j] && Math.abs(this.floor[j] - f) <= STEP) continue;
        // altura del obstáculo
        const ox = this.cx(i) + DIRS[d][0] * 0.75, oz = this.cz(i) + DIRS[d][1] * 0.75;
        const q = _q; this.world.query(ox - 0.15, f + 0.2, oz - 0.15, ox + 0.15, f + 4, oz + 0.15, q);
        let top = -1; for (const b of q) if (b.solid && b.sight && b.max[1] > top) top = b.max[1];
        const h = top - f;
        if (h < 0.95) continue;
        const key = (Math.floor(ix / 2)) + ',' + (Math.floor(iz / 2)) + ',' + d;
        if (taken.has(key)) continue;
        taken.add(key);
        this.cover.push({ i, x: this.cx(i) + DIRS[d][0] * 0.12, y: f, z: this.cz(i) + DIRS[d][1] * 0.12, nx: DIRS[d][0], nz: DIRS[d][1], low: h < 1.55, owner: null, until: 0 });
      }
    }
  }

  nearest(x, z, maxR = 6) {
    let i = this.idx(x, z);
    if (i >= 0 && this.walk[i]) return i;
    const ix0 = Math.floor((x - this.minX) / this.cell), iz0 = Math.floor((z - this.minZ) / this.cell);
    for (let r = 1; r <= maxR; r++) {
      let best = -1, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const jx = ix0 + dx, jz = iz0 + dz;
        if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
        const j = jz * this.nx + jx;
        if (!this.walk[j]) continue;
        const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  floorAt(x, z) { const i = this.idx(x, z); return i >= 0 && this.walk[i] ? this.floor[i] : 0; }

  randomNear(x, z, radius, tries = 20) {
    for (let k = 0; k < tries; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      const i = this.idx(x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (i >= 0 && this.walk[i]) return i;
    }
    return this.nearest(x, z, Math.ceil(radius));
  }
  randomCell() { return this.walkList[Math.floor(Math.random() * this.walkList.length)]; }

  // A*: devuelve lista de puntos {x,y,z} o null. extraCost(i) opcional.
  findPath(sx, sz, tx, tz, extraCost = null, maxNodes = 9000) {
    const s = this.nearest(sx, sz, 4), t = this.nearest(tx, tz, 8);
    if (s < 0 || t < 0) return null;
    if (s === t) return [{ x: tx, y: this.floor[t], z: tz }];
    const gen = ++this.gen;
    const H = this.heap; H.clear();
    const nx = this.nx;
    const tix = t % nx, tiz = Math.floor(t / nx);
    const h = (i) => { const dx = Math.abs((i % nx) - tix), dz = Math.abs(Math.floor(i / nx) - tiz); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    this.gScore[s] = 0; this.seen[s] = gen; this.parent[s] = -1;
    H.push(s, h(s));
    let found = false, n = 0;
    while (H.size) {
      const i = H.pop();
      if (this.closed[i] === gen) continue;
      this.closed[i] = gen;
      if (i === t) { found = true; break; }
      if (++n > maxNodes) break;
      const m = this.links[i]; const ix = i % nx, iz = Math.floor(i / nx); const gi = this.gScore[i];
      for (let d = 0; d < 8; d++) {
        if (!(m & (1 << d))) continue;
        const j = (iz + DIRS[d][1]) * nx + ix + DIRS[d][0];
        if (this.closed[j] === gen) continue;
        let c = d < 4 ? 1 : 1.4142;
        if (extraCost) c += extraCost(j);
        const g = gi + c;
        if (this.seen[j] !== gen || g < this.gScore[j]) {
          this.seen[j] = gen; this.gScore[j] = g; this.parent[j] = i;
          H.push(j, g + h(j));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = t; i !== -1; i = this.parent[i]) cells.push(i);
    cells.reverse();
    // suavizado
    const pts = [];
    let a = 0;
    while (a < cells.length - 1) {
      let b = cells.length - 1;
      while (b > a + 1 && !this.walkLine(cells[a], cells[b])) b--;
      pts.push({ x: this.cx(cells[b]), y: this.floor[cells[b]], z: this.cz(cells[b]) });
      a = b;
    }
    if (pts.length) { const last = pts[pts.length - 1]; const ti = this.idx(tx, tz); if (ti === t) { last.x = tx; last.z = tz; } }
    return pts;
  }

  walkLine(i0, i1) {
    const x0 = this.cx(i0), z0 = this.cz(i0), x1 = this.cx(i1), z1 = this.cz(i1);
    const L = Math.hypot(x1 - x0, z1 - z0); const steps = Math.ceil(L / 0.4);
    let pf = this.floor[i0];
    for (let k = 1; k <= steps; k++) {
      const t = k / steps; const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      // comprobar también laterales (anchura del agente)
      for (const o of [-0.32, 0, 0.32]) {
        const px = x + ((z1 - z0) / (L || 1)) * o, pz = z - ((x1 - x0) / (L || 1)) * o;
        const j = this.idx(px, pz);
        if (j < 0 || !this.walk[j]) return false;
        if (o === 0) { if (Math.abs(this.floor[j] - pf) > STEP) return false; }
        else if (Math.abs(this.floor[j] - pf) > STEP) return false;
      }
      pf = this.floor[this.idx(x, z)];
    }
    return true;
  }
}
const _q = [];
