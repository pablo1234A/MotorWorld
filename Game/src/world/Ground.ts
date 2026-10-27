import { Vector3 } from 'three';
import { smoothstep } from '../core/MathUtil';
import type { GroundHit, PhysicsWorld, StaticCollider } from '../physics/PhysicsWorld';
import { Surface } from '../physics/Surface';
import { RF, ROAD_STEP } from './RoadNetwork';
import { CURB_H, type Structures } from './Structures';
import { SHOULDER } from './Textures';
import type { WorldData } from './WorldGen';
import { CITY_Y } from './WorldDef';

const _v = new Vector3();

/**
 * Pure (render-free) ground & barrier queries over the generated world.
 * Used by the game world and by headless simulations/tests.
 */
export class Ground implements PhysicsWorld {
  wetness = 0;
  colliders: StaticCollider[] = [];
  constructor(public readonly data: WorldData, public readonly structures: Structures | null) {}

  queryStatic(x: number, z: number, r: number, out: StaticCollider[]) {
    for (const c of this.colliders) if (Math.abs(c.x - x) < r + 20 && Math.abs(c.z - z) < r + 20) out.push(c);
  }

  sampleGround(x: number, z: number, yRef: number, out: GroundHit): void {
    const hm = this.data.hm;
    let best = -Infinity;
    let bestSurf: Surface = Surface.Grass;
    let nx = 0, ny = 1, nz = 0;
    let water = 0;
    const th = hm.heightAt(x, z);
    const lim = yRef + 1.2;
    if (th <= lim) {
      best = th;
      bestSurf = hm.surfaceAt(x, z);
      hm.normalAt(x, z, _v);
      nx = _v.x;
      ny = _v.y;
      nz = _v.z;
    }
    // raised city sidewalks
    if (th < CITY_Y + 1 && th > CITY_Y - 1) {
      const b = this.structures?.blockAt(x, z);
      if (b) {
        const y = CITY_Y + CURB_H;
        if (y <= lim && y > best) {
          best = y;
          bestSurf = b.park ? Surface.Grass : Surface.Concrete;
          nx = nz = 0;
          ny = 1;
        }
      }
    }
    this.data.roads.query(x, z, SHOULDER + 0.5, (h) => {
      const y = h.y;
      const r = h.road;
      const onAsphalt = h.dist <= r.halfWidth;
      // the deck wins over terrain that pokes slightly through it
      if (y > lim || y < best - (onAsphalt ? 0.6 : 0.05)) return;
      if (!onAsphalt && h.dist > r.halfWidth + SHOULDER) return;
      best = y;
      bestSurf = onAsphalt ? r.info.surface : Surface.Gravel;
      const j = (h.i + 1) % r.n;
      const slope = (r.py[j] - r.py[h.i]) / ROAD_STEP;
      const l = Math.hypot(slope, 1);
      nx = (-r.tx[h.i] * slope) / l;
      ny = 1 / l;
      nz = (-r.tz[h.i] * slope) / l;
      if (onAsphalt && this.wetness > 0.3 && r.info.surface === Surface.Asphalt) {
        const n = this.data.gen.n2.noise(x / 9, z / 9);
        water = smoothstep(0.35, 0.6, n) * this.wetness;
      }
    });
    if (best === -Infinity) {
      // below every surface (e.g. fell through): report terrain so probes push the car up
      best = th;
      bestSurf = hm.surfaceAt(x, z);
    }
    out.height = best;
    out.normal.set(nx, ny, nz);
    out.surface = bestSurf;
    out.water = water;
  }

  /** Barrier (guard rail / tunnel wall) constraint for a world point. Returns push vector or null. */
  barrierAt(x: number, y: number, z: number, out: Vector3): number {
    let pen = 0;
    this.data.roads.query(x, z, 3.2, (h) => {
      const r = h.road;
      const f = r.flags[h.i];
      if (Math.abs(y - h.y) > 3) return;
      const tunnel = (f & RF.tunnel) !== 0;
      const limit = r.halfWidth + (tunnel ? 1.25 : 0.3);
      const lat = h.lateral;
      const side = lat > 0 ? 1 : -1;
      const has = tunnel || (side > 0 ? f & RF.railR : f & RF.railL);
      if (!has) return;
      const p = Math.abs(lat) - limit;
      if (p > 0 && p < 2.5 && p > pen) {
        pen = p;
        const j = (h.i + 1) % r.n;
        // inward normal = -right * side
        const rx = -r.tz[h.i], rz = r.tx[h.i];
        out.set(-rx * side, 0, -rz * side);
        void j;
      }
    });
    return pen;
  }

}
