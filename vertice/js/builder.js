// Constructor de geometría estática fusionada por material y por bloque (chunk) espacial.
import * as THREE from './lib/three.module.min.js';

export const F = { px: 1, nx: 2, py: 4, ny: 8, pz: 16, nz: 32, all: 63, sides: 1 | 2 | 16 | 32 };

class Bucket {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
}

export class Builder {
  constructor(minX, minZ, chunk = 64) {
    this.minX = minX; this.minZ = minZ; this.chunk = chunk;
    this.buckets = new Map();
  }
  _b(key, x, z) {
    const cx = Math.floor((x - this.minX) / this.chunk), cz = Math.floor((z - this.minZ) / this.chunk);
    const k = key + '|' + cx + '|' + cz;
    let b = this.buckets.get(k);
    if (!b) { b = new Bucket(); b.key = key; this.buckets.set(k, b); }
    return b;
  }
  _quad(b, p0, p1, p2, p3, n, uvs, c) {
    const base = b.count;
    for (const p of [p0, p1, p2, p3]) { b.pos.push(p[0], p[1], p[2]); b.nor.push(n[0], n[1], n[2]); b.col.push(c[0], c[1], c[2]); }
    for (const t of uvs) b.uv.push(t[0], t[1]);
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // Caja con UV en coordenadas de mundo. o: {tile:[tu,tv], off:[u,v], color:[r,g,b], faces}
  box(key, x0, y0, z0, x1, y1, z1, o = {}) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    const b = this._b(key, (x0 + x1) / 2, (z0 + z1) / 2);
    const tu = (o.tile && o.tile[0]) || 4, tv = (o.tile && o.tile[1]) || tu;
    const ou = (o.off && o.off[0]) || 0, ov = (o.off && o.off[1]) || 0;
    const c = o.color || [1, 1, 1];
    const f = o.faces ?? F.all;
    const U = (u) => u / tu + ou, V = (v) => v / tv + ov;
    if (f & F.px) this._quad(b, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[U(-z1), V(y0)], [U(-z0), V(y0)], [U(-z0), V(y1)], [U(-z1), V(y1)]], c);
    if (f & F.nx) this._quad(b, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[U(z0), V(y0)], [U(z1), V(y0)], [U(z1), V(y1)], [U(z0), V(y1)]], c);
    if (f & F.pz) this._quad(b, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[U(x0), V(y0)], [U(x1), V(y0)], [U(x1), V(y1)], [U(x0), V(y1)]], c);
    if (f & F.nz) this._quad(b, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[U(-x1), V(y0)], [U(-x0), V(y0)], [U(-x0), V(y1)], [U(-x1), V(y1)]], c);
    if (f & F.py) this._quad(b, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[U(x0), V(-z1)], [U(x1), V(-z1)], [U(x1), V(-z0)], [U(x0), V(-z0)]], c);
    if (f & F.ny) this._quad(b, [x1, y0, z1], [x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [0, -1, 0], [[U(-x1), V(-z1)], [U(-x0), V(-z1)], [U(-x0), V(-z0)], [U(-x1), V(-z0)]], c);
  }
  // Añade una BufferGeometry transformada (UV originales escaladas por uvScale)
  geo(key, g, matrix, color = [1, 1, 1], uvScale = 1) {
    const e = matrix.elements;
    const b = this._b(key, e[12], e[14]);
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
    const base = b.count; const v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(matrix); b.pos.push(v.x, v.y, v.z);
      if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); b.nor.push(v.x, v.y, v.z); } else b.nor.push(0, 1, 0);
      if (UV) b.uv.push(UV.getX(i) * uvScale, UV.getY(i) * uvScale); else b.uv.push(0, 0);
      b.col.push(color[0], color[1], color[2]);
    }
    if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) b.idx.push(base + I[i]); }
    else for (let i = 0; i < P.count; i++) b.idx.push(base + i);
  }
  // quad libre (para carteles, marcas viales)
  plane(key, p0, p1, p2, p3, n, uv, color = [1, 1, 1]) {
    const b = this._b(key, (p0[0] + p2[0]) / 2, (p0[2] + p2[2]) / 2);
    this._quad(b, p0, p1, p2, p3, n, uv, color);
  }
  build(materials, shadowCfg = {}) {
    const group = new THREE.Group();
    for (const b of this.buckets.values()) {
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.idx);
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mat = materials[b.key];
      if (!mat) { console.warn('material ausente', b.key); continue; }
      const m = new THREE.Mesh(g, mat);
      const sc = shadowCfg[b.key] || { cast: true, receive: true };
      m.castShadow = sc.cast; m.receiveShadow = sc.receive;
      m.matrixAutoUpdate = false; m.updateMatrix();
      m.name = b.key;
      group.add(m);
    }
    this.buckets.clear();
    return group;
  }
}
