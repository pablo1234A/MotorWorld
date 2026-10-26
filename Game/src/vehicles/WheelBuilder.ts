import { BoxGeometry, BufferGeometry, CylinderGeometry, LatheGeometry, Matrix4, TorusGeometry, Vector2 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, cellUV } from './CarMaterials';

/**
 * Wheel parts are built in a frame where the axle is the X axis and the
 * outer face of the wheel points to +X.
 */
export interface WheelGeometries {
  tire: BufferGeometry; // atlas
  rim: BufferGeometry; // rim material
  disc: BufferGeometry; // atlas
  caliper: BufferGeometry; // caliper material
  rimRadius: number;
}

const cache = new Map<string, WheelGeometries>();

function prep(g: BufferGeometry): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (!ng.getAttribute('uv')) {
    const n = ng.getAttribute('position').count;
    ng.setAttribute('uv', new (ng.getAttribute('position').constructor as any)(new Float32Array(n * 2), 2));
  }
  return ng;
}

export function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const ps = parts.map((p) => {
    const g = prep(p);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  const m = mergeGeometries(ps, false)!;
  m.computeBoundingSphere();
  return m;
}

const m4 = new Matrix4();

function tireGeometry(R: number, rimR: number, w: number, segs: number, offroad: boolean): BufferGeometry {
  const hw = w / 2;
  const pts: Vector2[] = [
    new Vector2(rimR * 0.98, -hw * 0.92),
    new Vector2(rimR + (R - rimR) * 0.35, -hw),
    new Vector2(R * 0.975, -hw * 0.94),
    new Vector2(R, -hw * 0.72),
    new Vector2(R, hw * 0.72),
    new Vector2(R * 0.975, hw * 0.94),
    new Vector2(rimR + (R - rimR) * 0.35, hw),
    new Vector2(rimR * 0.98, hw * 0.92),
  ];
  const g = new LatheGeometry(pts, segs);
  // Lathe axis is Y; rotate so axle = X
  g.applyMatrix4(m4.makeRotationZ(-Math.PI / 2));
  cellUV(g, CELL.rubber);
  const parts: BufferGeometry[] = [g];
  if (offroad) {
    // chunky tread blocks
    const n = Math.round(segs * 0.75);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (const side of [-1, 1]) {
        const blk = new BoxGeometry(w * 0.34, 0.03, 0.07);
        blk.applyMatrix4(m4.makeTranslation(side * w * 0.22 + (i % 2 ? 0.02 : -0.02), R + 0.006, 0));
        blk.applyMatrix4(m4.makeRotationX(a));
        cellUV(blk, CELL.rubber);
        parts.push(blk);
      }
    }
  }
  return parts.length > 1 ? mergeParts(parts) : prep(g);
}

function spoke(len: number, w0: number, w1: number, depth: number, dish: number): BufferGeometry {
  // tapered spoke from hub (y=0) to rim (y=len), lying in the YZ plane at x offset (dish)
  const g = new BoxGeometry(depth, len, 1, 1, 1, 1);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + len / 2; // 0..len
    const f = y / len;
    p.setZ(i, p.getZ(i) * (w0 + (w1 - w0) * f));
    p.setY(i, y);
    // concave dish: outer face recedes towards the rim
    p.setX(i, p.getX(i) - dish * f * f);
  }
  g.computeVertexNormals();
  return g;
}

function rimGeometry(style: number, rimR: number, w: number, segs: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const outer = w * 0.42;
  // barrel
  const barrel = new CylinderGeometry(rimR, rimR, w * 0.86, segs, 1, true);
  barrel.applyMatrix4(m4.makeRotationZ(Math.PI / 2));
  parts.push(barrel);
  // outer lip
  const lip = new TorusGeometry(rimR - 0.006, 0.014, 6, segs);
  lip.applyMatrix4(m4.makeRotationY(Math.PI / 2));
  lip.applyMatrix4(m4.makeTranslation(outer, 0, 0));
  parts.push(lip);
  const hubR = rimR * 0.24;
  const addRadial = (count: number, make: () => BufferGeometry, offset = 0) => {
    for (let i = 0; i < count; i++) {
      const g = make();
      g.applyMatrix4(m4.makeRotationX(((i + offset) / count) * Math.PI * 2));
      g.applyMatrix4(m4.makeTranslation(outer - 0.012, 0, 0));
      parts.push(g);
    }
  };
  const L = rimR - hubR * 0.6;
  const mk = (w0: number, w1: number, dish: number, depth = 0.03) => () => {
    const s = spoke(L, w0, w1, depth, dish);
    s.applyMatrix4(m4.makeTranslation(0, hubR * 0.6, 0));
    return s;
  };
  switch (style) {
    case 0: // Apex 5
      addRadial(5, mk(0.07, 0.045, 0.03, 0.035));
      break;
    case 1: // Fifteen thin spokes
      addRadial(15, mk(0.022, 0.016, 0.02, 0.024));
      break;
    case 2: // Mesh RS: crossed spokes
      for (let i = 0; i < 10; i++) {
        for (const tw of [-0.32, 0.32]) {
          const s = spoke(L * 1.02, 0.016, 0.014, 0.022, 0.015);
          s.applyMatrix4(m4.makeRotationX(tw));
          s.applyMatrix4(m4.makeTranslation(0, hubR * 0.7, 0));
          s.applyMatrix4(m4.makeRotationX((i / 10) * Math.PI * 2));
          s.applyMatrix4(m4.makeTranslation(outer - 0.014, 0, 0));
          parts.push(s);
        }
      }
      break;
    case 3: { // Aero disc
      const disc = new CylinderGeometry(rimR * 0.97, rimR * 0.97, 0.02, segs);
      disc.applyMatrix4(m4.makeRotationZ(Math.PI / 2));
      disc.applyMatrix4(m4.makeTranslation(outer - 0.03, 0, 0));
      parts.push(disc);
      addRadial(6, () => {
        const vane = new BoxGeometry(0.012, L * 0.75, 0.05);
        vane.applyMatrix4(m4.makeRotationX(0.5));
        vane.applyMatrix4(m4.makeTranslation(0.012, hubR + L * 0.4, 0));
        return vane;
      });
      break;
    }
    case 4: // Split six
      addRadial(6, mk(0.024, 0.02, 0.025), -0.045);
      addRadial(6, mk(0.024, 0.02, 0.025), 0.045);
      break;
    case 5: { // Classic deep dish steel + hubcap
      const dish = new CylinderGeometry(rimR * 0.92, rimR * 0.62, 0.05, segs, 1, true);
      dish.applyMatrix4(m4.makeRotationZ(Math.PI / 2));
      dish.applyMatrix4(m4.makeTranslation(outer - 0.03, 0, 0));
      parts.push(dish);
      const face = new CylinderGeometry(rimR * 0.62, rimR * 0.62, 0.012, segs);
      face.applyMatrix4(m4.makeRotationZ(Math.PI / 2));
      face.applyMatrix4(m4.makeTranslation(outer - 0.055, 0, 0));
      parts.push(face);
      const cap = new CylinderGeometry(rimR * 0.3, rimR * 0.4, 0.05, segs);
      cap.applyMatrix4(m4.makeRotationZ(Math.PI / 2));
      cap.applyMatrix4(m4.makeTranslation(outer - 0.03, 0, 0));
      parts.push(cap);
      addRadial(4, mk(0.05, 0.04, 0.0, 0.02));
      break;
    }
    case 6: { // Trail beadlock
      const disc = new CylinderGeometry(rimR * 0.95, rimR * 0.95, 0.018, segs);
      disc.applyMatrix4(m4.makeRotationZ(Math.PI / 2));
      disc.applyMatrix4(m4.makeTranslation(outer - 0.05, 0, 0));
      parts.push(disc);
      const ring = new TorusGeometry(rimR * 0.9, 0.022, 6, segs);
      ring.applyMatrix4(m4.makeRotationY(Math.PI / 2));
      ring.applyMatrix4(m4.makeTranslation(outer - 0.01, 0, 0));
      parts.push(ring);
      addRadial(16, () => {
        const b = new CylinderGeometry(0.008, 0.008, 0.03, 6);
        b.applyMatrix4(m4.makeRotationZ(Math.PI / 2));
        b.applyMatrix4(m4.makeTranslation(0.012, rimR * 0.9, 0));
        return b;
      });
      addRadial(6, mk(0.06, 0.07, 0.0, 0.03));
      break;
    }
    default: // 7 Y-spoke
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const trunk = spoke(L * 0.5, 0.05, 0.04, 0.03, 0.01);
        trunk.applyMatrix4(m4.makeTranslation(0, hubR * 0.6, 0));
        trunk.applyMatrix4(m4.makeRotationX(a));
        trunk.applyMatrix4(m4.makeTranslation(outer - 0.012, 0, 0));
        parts.push(trunk);
        for (const tw of [-0.2, 0.2]) {
          const br = spoke(L * 0.55, 0.03, 0.025, 0.028, 0.025);
          br.applyMatrix4(m4.makeRotationX(tw));
          br.applyMatrix4(m4.makeTranslation(-0.006, hubR * 0.6 + L * 0.45, 0));
          br.applyMatrix4(m4.makeRotationX(a));
          br.applyMatrix4(m4.makeTranslation(outer - 0.012, 0, 0));
          parts.push(br);
        }
      }
  }
  // hub + centre cap + lug nuts
  const hub = new CylinderGeometry(hubR, hubR * 1.1, 0.05, 20);
  hub.applyMatrix4(m4.makeRotationZ(Math.PI / 2));
  hub.applyMatrix4(m4.makeTranslation(outer - 0.03, 0, 0));
  parts.push(hub);
  for (let i = 0; i < 5; i++) {
    const nut = new CylinderGeometry(0.011, 0.011, 0.02, 6);
    nut.applyMatrix4(m4.makeRotationZ(Math.PI / 2));
    nut.applyMatrix4(m4.makeTranslation(outer - 0.004, hubR * 0.62, 0));
    nut.applyMatrix4(m4.makeRotationX((i / 5) * Math.PI * 2));
    parts.push(nut);
  }
  return mergeParts(parts);
}

export function buildWheel(R: number, tireW: number, rimStyle: number, rimSize: number, offroad: boolean, quality: number): WheelGeometries {
  const key = [R.toFixed(3), tireW.toFixed(3), rimStyle, rimSize, offroad, quality].join('|');
  const c = cache.get(key);
  if (c) return c;
  const segs = quality >= 2 ? 36 : quality === 1 ? 24 : 16;
  const aspect = offroad ? 0.62 : 0.4;
  const sidewall = Math.min(tireW * aspect, R * 0.42) - rimSize * 0.0127;
  const rimR = R - Math.max(0.05, sidewall);
  const tire = tireGeometry(R, rimR, tireW, segs, offroad);
  const rim = rimGeometry(rimStyle, rimR, tireW, segs);
  const disc = new CylinderGeometry(rimR * 0.8, rimR * 0.8, 0.028, segs);
  disc.applyMatrix4(m4.makeRotationZ(Math.PI / 2));
  disc.applyMatrix4(m4.makeTranslation(-tireW * 0.12, 0, 0));
  cellUV(disc, CELL.disc, true);
  const cal = new BoxGeometry(0.06, rimR * 0.5, rimR * 0.28);
  cal.applyMatrix4(m4.makeTranslation(-tireW * 0.04, 0, 0));
  cal.applyMatrix4(m4.makeRotationX(-0.9));
  cal.applyMatrix4(m4.makeTranslation(0, rimR * 0.52 * Math.cos(0.9), rimR * 0.52 * Math.sin(0.9)));
  const res: WheelGeometries = { tire, rim, disc: prep(disc), caliper: prep(cal), rimRadius: rimR };
  cache.set(key, res);
  return res;
}
