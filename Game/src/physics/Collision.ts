import { Vector3 } from 'three';

/**
 * 2D oriented-box separating-axis test. Boxes are (cx, cz, hx, hz, rot).
 * Returns penetration depth and the normal pointing from B towards A, plus a contact point.
 */
export interface Contact2D {
  hit: boolean;
  nx: number;
  nz: number;
  depth: number;
  px: number;
  pz: number;
}

function axes(rot: number): [number, number, number, number] {
  const c = Math.cos(rot), s = Math.sin(rot);
  // local X axis and local Z axis in world (rotation about Y)
  return [c, -s, s, c];
}

function project(cx: number, cz: number, hx: number, hz: number, ax: number[], nx: number, nz: number) {
  const center = cx * nx + cz * nz;
  const r = hx * Math.abs(ax[0] * nx + ax[1] * nz) + hz * Math.abs(ax[2] * nx + ax[3] * nz);
  return [center - r, center + r];
}

export function obbObb(
  ax_: number, az: number, ahx: number, ahz: number, arot: number,
  bx: number, bz: number, bhx: number, bhz: number, brot: number,
  out: Contact2D,
): Contact2D {
  const A = axes(arot), B = axes(brot);
  const candidates = [A[0], A[1], A[2], A[3], B[0], B[1], B[2], B[3]];
  let best = Infinity, bnx = 0, bnz = 0;
  for (let i = 0; i < 8; i += 2) {
    const nx = candidates[i], nz = candidates[i + 1];
    const pa = project(ax_, az, ahx, ahz, A, nx, nz);
    const pb = project(bx, bz, bhx, bhz, B, nx, nz);
    const o = Math.min(pa[1] - pb[0], pb[1] - pa[0]);
    if (o <= 0) {
      out.hit = false;
      return out;
    }
    if (o < best) {
      best = o;
      const dir = (ax_ - bx) * nx + (az - bz) * nz;
      bnx = dir >= 0 ? nx : -nx;
      bnz = dir >= 0 ? nz : -nz;
    }
  }
  out.hit = true;
  out.depth = best;
  out.nx = bnx;
  out.nz = bnz;
  // Contact point: deepest corner of A along -n, else of B along +n; average if comparable.
  const ca = deepestCorner(ax_, az, ahx, ahz, A, -bnx, -bnz);
  const cb = deepestCorner(bx, bz, bhx, bhz, B, bnx, bnz);
  // pick corner that lies inside the other box
  const aInB = pointInObb(ca[0], ca[1], bx, bz, bhx, bhz, B);
  const bInA = pointInObb(cb[0], cb[1], ax_, az, ahx, ahz, A);
  if (aInB && !bInA) {
    out.px = ca[0];
    out.pz = ca[1];
  } else if (bInA && !aInB) {
    out.px = cb[0];
    out.pz = cb[1];
  } else {
    out.px = (ca[0] + cb[0]) * 0.5;
    out.pz = (ca[1] + cb[1]) * 0.5;
  }
  return out;
}

function deepestCorner(cx: number, cz: number, hx: number, hz: number, ax: number[], nx: number, nz: number): [number, number] {
  const sx = ax[0] * nx + ax[1] * nz >= 0 ? 1 : -1;
  const sz = ax[2] * nx + ax[3] * nz >= 0 ? 1 : -1;
  return [cx + ax[0] * hx * sx + ax[2] * hz * sz, cz + ax[1] * hx * sx + ax[3] * hz * sz];
}

function pointInObb(px: number, pz: number, cx: number, cz: number, hx: number, hz: number, ax: number[]) {
  const dx = px - cx, dz = pz - cz;
  return Math.abs(dx * ax[0] + dz * ax[1]) <= hx + 1e-3 && Math.abs(dx * ax[2] + dz * ax[3]) <= hz + 1e-3;
}

/** Circle vs OBB (A). Normal points from circle towards box A. */
export function obbCircle(
  ax_: number, az: number, ahx: number, ahz: number, arot: number,
  cx: number, cz: number, r: number,
  out: Contact2D,
): Contact2D {
  const A = axes(arot);
  const dx = cx - ax_, dz = cz - az;
  const lx = dx * A[0] + dz * A[1];
  const lz = dx * A[2] + dz * A[3];
  const qx = Math.max(-ahx, Math.min(ahx, lx));
  const qz = Math.max(-ahz, Math.min(ahz, lz));
  const inside = qx === lx && qz === lz;
  let wx = ax_ + A[0] * qx + A[2] * qz;
  let wz = az + A[1] * qx + A[3] * qz;
  let ex = wx - cx, ez = wz - cz;
  let d = Math.hypot(ex, ez);
  if (inside) {
    // circle centre inside box: push out along shortest local axis
    const px = ahx - Math.abs(lx), pz = ahz - Math.abs(lz);
    if (px < pz) {
      const s = lx >= 0 ? -1 : 1;
      out.nx = A[0] * s;
      out.nz = A[1] * s;
      out.depth = px + r;
    } else {
      const s = lz >= 0 ? -1 : 1;
      out.nx = A[2] * s;
      out.nz = A[3] * s;
      out.depth = pz + r;
    }
    out.hit = true;
    out.px = cx;
    out.pz = cz;
    return out;
  }
  if (d >= r) {
    out.hit = false;
    return out;
  }
  out.hit = true;
  out.nx = d > 1e-6 ? ex / d : 1;
  out.nz = d > 1e-6 ? ez / d : 0;
  out.depth = r - d;
  out.px = wx;
  out.pz = wz;
  return out;
}

export const tmpV = new Vector3();
