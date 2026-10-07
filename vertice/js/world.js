// Mundo de colisiones: cajas AABB estáticas/destructibles en una rejilla espacial.
// Raycast con DDA, movimiento de personaje con subida de escalones y LOS.

export class World {
  constructor(minX, minZ, maxX, maxZ, cell = 4) {
    this.minX = minX; this.minZ = minZ; this.maxX = maxX; this.maxZ = maxZ;
    this.cell = cell;
    this.nx = Math.ceil((maxX - minX) / cell); this.nz = Math.ceil((maxZ - minZ) / cell);
    this.grid = new Array(this.nx * this.nz);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
    this.boxes = [];
    this.stamp = 1;
  }

  // props: {mat, hp, onBreak, solid (colisión movimiento), bullet (bloquea balas), sight (bloquea visión)}
  addBox(x0, y0, z0, x1, y1, z1, props = {}) {
    const b = {
      id: this.boxes.length,
      min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      mat: props.mat || 'concrete',
      solid: props.solid !== false, bullet: props.bullet !== false, sight: props.sight !== false,
      hp: props.hp || 0, dead: false, onBreak: props.onBreak || null, data: props.data || null, mark: 0,
    };
    this.boxes.push(b);
    this._insert(b);
    return b;
  }
  addCenter(cx, cy, cz, sx, sy, sz, props) { return this.addBox(cx - sx / 2, cy, cz - sz / 2, cx + sx / 2, cy + sy, cz + sz / 2, props); }

  _insert(b) {
    const c = this.cell;
    const ix0 = Math.max(0, Math.floor((b.min[0] - this.minX) / c)), ix1 = Math.min(this.nx - 1, Math.floor((b.max[0] - this.minX) / c));
    const iz0 = Math.max(0, Math.floor((b.min[2] - this.minZ) / c)), iz1 = Math.min(this.nz - 1, Math.floor((b.max[2] - this.minZ) / c));
    for (let z = iz0; z <= iz1; z++) for (let x = ix0; x <= ix1; x++) this.grid[z * this.nx + x].push(b);
  }

  remove(b) { b.dead = true; }

  query(minx, miny, minz, maxx, maxy, maxz, out) {
    out.length = 0;
    const c = this.cell; const st = ++this.stamp;
    const ix0 = Math.max(0, Math.floor((minx - this.minX) / c)), ix1 = Math.min(this.nx - 1, Math.floor((maxx - this.minX) / c));
    const iz0 = Math.max(0, Math.floor((minz - this.minZ) / c)), iz1 = Math.min(this.nz - 1, Math.floor((maxz - this.minZ) / c));
    for (let z = iz0; z <= iz1; z++) for (let x = ix0; x <= ix1; x++) {
      const cellArr = this.grid[z * this.nx + x];
      for (let i = 0; i < cellArr.length; i++) {
        const b = cellArr[i];
        if (b.mark === st || b.dead) continue;
        b.mark = st;
        if (b.max[0] <= minx || b.min[0] >= maxx || b.max[1] <= miny || b.min[1] >= maxy || b.max[2] <= minz || b.min[2] >= maxz) continue;
        out.push(b);
      }
    }
    return out;
  }

  // Raycast: devuelve {t, box, nx, ny, nz} o null. filter: 'bullet' | 'sight' | 'solid'
  raycast(ox, oy, oz, dx, dy, dz, maxT, filter = 'bullet', res = {}) {
    const c = this.cell;
    let best = maxT, bestBox = null, bn = 0;
    // suelo y = 0
    if (dy < 0 && oy > 0) {
      const tg = -oy / dy;
      if (tg < best) { best = tg; bestBox = GROUND; bn = 1; }
    }
    const st = ++this.stamp;
    // DDA sobre la rejilla XZ
    let gx = (ox - this.minX) / c, gz = (oz - this.minZ) / c;
    let ix = Math.floor(gx), iz = Math.floor(gz);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) > 1e-9 ? Math.abs(c / dx) : Infinity;
    const tDeltaZ = Math.abs(dz) > 1e-9 ? Math.abs(c / dz) : Infinity;
    let tMaxX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (ix + 1 - gx) : (gx - ix)) * c) / Math.abs(dx) : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (iz + 1 - gz) : (gz - iz)) * c) / Math.abs(dz) : Infinity;
    let tCell = 0;
    for (let guard = 0; guard < 512; guard++) {
      if (ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz) {
        const arr = this.grid[iz * this.nx + ix];
        for (let i = 0; i < arr.length; i++) {
          const b = arr[i];
          if (b.mark === st || b.dead) continue;
          b.mark = st;
          if (!b[filter]) continue;
          // slab
          let tmin = 0, tmax = best, n = -1, sgn = 0;
          let fail = false;
          for (let a = 0; a < 3; a++) {
            const o = a === 0 ? ox : a === 1 ? oy : oz, d = a === 0 ? dx : a === 1 ? dy : dz;
            const mn = b.min[a], mx = b.max[a];
            if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { fail = true; break; } continue; }
            let t1 = (mn - o) / d, t2 = (mx - o) / d, s = -1;
            if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
            if (t1 > tmin) { tmin = t1; n = a; sgn = s; }
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) { fail = true; break; }
          }
          if (fail) continue;
          if (tmin < best && n >= 0) { best = tmin; bestBox = b; bn = n * 2 + (sgn > 0 ? 1 : 0); }
          else if (n < 0 && tmin === 0) { best = 0; bestBox = b; bn = 0; } // origen dentro
        }
      }
      // avanzar
      if (tMaxX < tMaxZ) { tCell = tMaxX; tMaxX += tDeltaX; ix += stepX; }
      else { tCell = tMaxZ; tMaxZ += tDeltaZ; iz += stepZ; }
      if (tCell > best || tCell > maxT) break;
      if ((ix < -1 && stepX < 0) || (iz < -1 && stepZ < 0) || (ix > this.nx && stepX > 0) || (iz > this.nz && stepZ > 0)) break;
    }
    if (!bestBox) return null;
    res.t = best; res.box = bestBox;
    // normal: eje n, signo
    res.nx = res.ny = res.nz = 0;
    if (bestBox === GROUND) res.ny = 1;
    else {
      const axis = bn >> 1; const s = (bn & 1) ? 1 : -1; // s=1 => golpeamos la cara max
      if (axis === 0) res.nx = s; else if (axis === 1) res.ny = s; else res.nz = s;
    }
    return res;
  }

  // Línea de visión libre entre dos puntos
  los(ax, ay, az, bx, by, bz, filter = 'sight') {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-4) return true;
    const r = this.raycast(ax, ay, az, dx / L, dy / L, dz / L, L - 0.05, filter, _tmpRes);
    return !r;
  }

  // Movimiento de personaje (caja vertical). pos: {x,y,z} pies; mueve in-place.
  // Devuelve flags: {ground, hitWall, ceiling}
  move(pos, dx, dy, dz, r, h, stepH, grounded, out) {
    out.ground = false; out.hitWall = false; out.ceiling = false; out.stepped = 0;
    const q = _qArr;
    // --- eje X
    if (dx !== 0) {
      pos.x += dx;
      this.query(pos.x - r, pos.y + 0.01, pos.z - r, pos.x + r, pos.y + h, pos.z + r, q);
      for (const b of q) {
        if (!b.solid) continue;
        const top = b.max[1];
        if (grounded && top - pos.y <= stepH && top > pos.y && this._free(pos.x, top + 0.005, pos.z, r, h)) { out.stepped = Math.max(out.stepped, top - pos.y); pos.y = top + 0.001; continue; }
        if (b.max[1] <= pos.y + 0.01 || b.min[1] >= pos.y + h) continue;
        if (dx > 0) pos.x = Math.min(pos.x, b.min[0] - r - 0.001); else pos.x = Math.max(pos.x, b.max[0] + r + 0.001);
        out.hitWall = true;
      }
    }
    // --- eje Z
    if (dz !== 0) {
      pos.z += dz;
      this.query(pos.x - r, pos.y + 0.01, pos.z - r, pos.x + r, pos.y + h, pos.z + r, q);
      for (const b of q) {
        if (!b.solid) continue;
        const top = b.max[1];
        if (grounded && top - pos.y <= stepH && top > pos.y && this._free(pos.x, top + 0.005, pos.z, r, h)) { out.stepped = Math.max(out.stepped, top - pos.y); pos.y = top + 0.001; continue; }
        if (b.max[1] <= pos.y + 0.01 || b.min[1] >= pos.y + h) continue;
        if (dz > 0) pos.z = Math.min(pos.z, b.min[2] - r - 0.001); else pos.z = Math.max(pos.z, b.max[2] + r + 0.001);
        out.hitWall = true;
      }
    }
    // --- eje Y
    const oldY = pos.y;
    pos.y += dy;
    if (dy <= 0) {
      this.query(pos.x - r + 0.02, pos.y - 0.001, pos.z - r + 0.02, pos.x + r - 0.02, oldY + 0.05, pos.z + r - 0.02, q);
      let best = -Infinity;
      for (const b of q) { if (b.solid && b.max[1] <= oldY + 0.06 && b.max[1] > best) best = b.max[1]; }
      if (best > -Infinity && pos.y <= best) { pos.y = best; out.ground = true; }
    } else {
      this.query(pos.x - r + 0.02, oldY + h - 0.05, pos.z - r + 0.02, pos.x + r - 0.02, pos.y + h, pos.z + r - 0.02, q);
      for (const b of q) { if (b.solid && b.min[1] >= oldY + h - 0.06) { pos.y = Math.min(pos.y, b.min[1] - h - 0.001); out.ceiling = true; } }
    }
    if (pos.y <= 0) { pos.y = 0; out.ground = true; }
    // límites del mapa
    pos.x = Math.max(this.minX + r + 0.5, Math.min(this.maxX - r - 0.5, pos.x));
    pos.z = Math.max(this.minZ + r + 0.5, Math.min(this.maxZ - r - 0.5, pos.z));
    return out;
  }

  _free(x, y, z, r, h) {
    const q = _qArr2;
    this.query(x - r, y, z - r, x + r, y + h, z + r, q);
    for (const b of q) if (b.solid) return false;
    return true;
  }

  // Altura del suelo bajo un punto (máxima cara superior <= y + tol)
  groundAt(x, z, y = 50, r = 0.05) {
    const q = _qArr2; let best = 0;
    this.query(x - r, -1, z - r, x + r, y, z + r, q);
    for (const b of q) if (b.solid && b.max[1] <= y + 0.01 && b.max[1] > best) best = b.max[1];
    return best;
  }

  overlapsSolid(x0, y0, z0, x1, y1, z1) {
    const q = _qArr2;
    this.query(x0, y0, z0, x1, y1, z1, q);
    for (const b of q) if (b.solid) return true;
    return false;
  }
}

export const GROUND = { id: -1, min: [-1e9, -1, -1e9], max: [1e9, 0, 1e9], mat: 'ground', solid: true, bullet: true, sight: true, dead: false };
const _tmpRes = {};
const _qArr = [];
const _qArr2 = [];
