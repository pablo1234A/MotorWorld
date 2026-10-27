import { clamp, lerp, pointSegDist2, smoothstep } from '../core/MathUtil';
import { Simplex2 } from '../core/Noise';
import { CITY, CITY_Y, HALF, PORT, PORT_Y, RIVER } from './WorldDef';

/** Natural (pre-road) terrain shape of the island. Pure function of (x, z). */
export class TerrainGen {
  readonly n1 = new Simplex2(1337);
  readonly n2 = new Simplex2(7331);
  readonly n3 = new Simplex2(4242);
  private riverLen: number[] = [0];

  constructor() {
    const p = RIVER.pts;
    for (let i = 1; i < p.length; i++) this.riverLen.push(this.riverLen[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  }

  /** Distance to the river centre line and the water surface height there. */
  river(x: number, z: number): { d: number; water: number } {
    const p = RIVER.pts;
    let best = Infinity, bs = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const r = pointSegDist2(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
      if (r.d2 < best) {
        best = r.d2;
        bs = this.riverLen[i] + r.t * (this.riverLen[i + 1] - this.riverLen[i]);
      }
    }
    const total = this.riverLen[this.riverLen.length - 1];
    const water = lerp(RIVER.topY, 0.2, Math.pow(bs / total, 0.8));
    return { d: Math.sqrt(best), water };
  }

  private riverBoxes: number[][] = [];
  nearRiver(x: number, z: number, pad: number): boolean {
    if (!this.riverBoxes.length) {
      const p = RIVER.pts;
      for (let i = 0; i < p.length - 1; i++) this.riverBoxes.push([Math.min(p[i][0], p[i + 1][0]), Math.min(p[i][1], p[i + 1][1]), Math.max(p[i][0], p[i + 1][0]), Math.max(p[i][1], p[i + 1][1])]);
    }
    for (const b of this.riverBoxes) if (x > b[0] - pad && x < b[2] + pad && z > b[1] - pad && z < b[3] + pad) return true;
    return false;
  }

  shoreX(z: number) {
    return 1615 + 70 * this.n2.noise(0.3, z / 520) + 25 * this.n2.noise(5.1, z / 140);
  }

  /** 0 inside the city/port flat areas, used for biome decisions too. */
  cityMask(x: number, z: number): number {
    const dc = rectDist(x, z, CITY.x0 - 70, CITY.z0 - 70, CITY.x1 + 70, CITY.z1 + 70);
    return 1 - smoothstep(0, 220, dc);
  }
  portMask(x: number, z: number): number {
    const dp = rectDist(x, z, PORT.x0 - 50, PORT.z0 - 40, PORT.x1 + 60, PORT.z1 + 120);
    return 1 - smoothstep(0, 160, dp);
  }
  racewayMask(x: number, z: number): number {
    const ex = (x - 545) / 560, ez = (z + 1350) / 360;
    return 1 - smoothstep(1.0, 1.45, Math.hypot(ex, ez));
  }
  stripMask(x: number, z: number): number {
    return 1 - smoothstep(0, 120, rectDist(x, z, -650, 1270, 1260, 1330));
  }
  mountainMask(x: number, z: number): number {
    const mx = (x + 1150) / 900, mz = (z + 1150) / 720;
    return smoothstep(1.2, 0.4, Math.hypot(mx, mz));
  }
  forestMask(x: number, z: number): number {
    return 1 - smoothstep(520, 900, Math.hypot(x + 1000, z - 1100));
  }

  natural(x: number, z: number): number {
    const n1 = this.n1;
    let h = 16 + 15 * n1.fbm(x / 1150, z / 1150, 4) + 4 * n1.fbm(x / 240, z / 240, 2);
    const fm = this.forestMask(x, z);
    if (fm > 0) h += fm * (18 + 22 * n1.fbm(x / 420 + 7, z / 420, 3));
    const mm = this.mountainMask(x, z);
    if (mm > 0) {
      const core = smoothstep(1.1, 0.15, Math.hypot((x + 1150) / 900, (z + 1150) / 720));
      h += mm * 70 + mm * core * (120 + 260 * this.n3.ridged(x / 1000, z / 1000, 4));
    }
    // gentle hills south of the raceway / north of the city
    h += 10 * smoothstep(-500, -1200, z) * (1 - mm);
    // flatten developed areas
    const cm = this.cityMask(x, z);
    if (cm > 0) h = lerp(h, CITY_Y, cm);
    const pm = this.portMask(x, z);
    if (pm > 0) h = lerp(h, PORT_Y, pm);
    const sm = this.stripMask(x, z);
    if (sm > 0) h = lerp(h, PORT_Y + 1, sm);
    const rm = this.racewayMask(x, z);
    if (rm > 0) h = lerp(h, 24, rm);
    // river valley (cheap AABB reject first: most of the island is far from the river)
    const rv = this.nearRiver(x, z, RIVER.width * 3) ? this.river(x, z) : FAR_RIVER;
    if (rv.d < RIVER.width * 3) {
      const bed = rv.water - 3;
      const bank = smoothstep(RIVER.width * 0.35, RIVER.width * 1.7, rv.d);
      h = lerp(bed, Math.max(h, rv.water + 1.2), bank);
    }
    // coast (east) and island edges
    const sx = this.shoreX(z);
    const c = smoothstep(sx - 200, sx + 140, x);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const e = smoothstep(HALF - 140, HALF - 20, edge + 25 * this.n2.noise(x / 300, z / 300));
    const sea = Math.max(c, e);
    if (sea > 0) {
      // beach plateau then drop-off
      const beach = lerp(h, 2.2, smoothstep(0, 0.45, sea));
      h = lerp(beach, -24, smoothstep(0.45, 1, sea));
    }
    return h;
  }
}

const FAR_RIVER = { d: 1e9, water: 0 };

export function rectDist(x: number, z: number, x0: number, z0: number, x1: number, z1: number) {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dz = Math.max(z0 - z, 0, z - z1);
  return Math.hypot(dx, dz);
}

export { clamp };
