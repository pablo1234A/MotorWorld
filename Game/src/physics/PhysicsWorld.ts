import { Vector3 } from 'three';
import { Surface } from './Surface';

export interface GroundHit {
  height: number;
  normal: Vector3;
  surface: Surface;
  /** 0..1 standing water at this point (rain puddles). */
  water: number;
}

/** 2D oriented box (top-down) with a vertical extent. */
export interface BoxCollider {
  kind: 'box';
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** Rotation around Y (radians). */
  rot: number;
  yMin: number;
  yMax: number;
  /** Optional: breakable prop id (bonus boards, cones, fences). */
  breakable?: number;
}

export interface CircleCollider {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
  yMin: number;
  yMax: number;
  breakable?: number;
}

export type StaticCollider = BoxCollider | CircleCollider;

export interface PhysicsWorld {
  /** Sample the highest walkable surface at (x,z) that is not far above yRef. */
  sampleGround(x: number, z: number, yRef: number, out: GroundHit): void;
  /** Static colliders overlapping the XZ circle. */
  queryStatic(x: number, z: number, radius: number, out: StaticCollider[]): void;
  /** Ambient wetness 0..1 (rain). */
  wetness: number;
  /** Called when a breakable collider is hit. */
  onBreak?(id: number, impactSpeed: number): void;
}

/** Infinite flat asphalt plane, for tests and the garage showroom. */
export class FlatWorld implements PhysicsWorld {
  wetness = 0;
  colliders: StaticCollider[] = [];
  constructor(public height = 0, public surface: Surface = Surface.Asphalt) {}
  sampleGround(_x: number, _z: number, _y: number, out: GroundHit) {
    out.height = this.height;
    out.normal.set(0, 1, 0);
    out.surface = this.surface;
    out.water = 0;
  }
  queryStatic(x: number, z: number, r: number, out: StaticCollider[]) {
    for (const c of this.colliders) {
      const cr = c.kind === 'box' ? Math.hypot(c.hx, c.hz) : c.r;
      if (Math.hypot(c.x - x, c.z - z) < r + cr) out.push(c);
    }
  }
}
