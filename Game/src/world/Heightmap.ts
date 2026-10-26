import { Vector3 } from 'three';
import { Surface } from '../physics/Surface';
import { GRID_RES, HALF, WORLD_SIZE } from './WorldDef';

/**
 * Global terrain height grid (GRID_RES metres). Triangulation matches the terrain
 * meshes exactly (diagonal from (i,j) to (i+1,j+1)), so physics and visuals agree.
 */
export class Heightmap {
  readonly n = WORLD_SIZE / GRID_RES + 1;
  readonly h: Float32Array;
  readonly surf: Uint8Array;

  constructor() {
    this.h = new Float32Array(this.n * this.n);
    this.surf = new Uint8Array(this.n * this.n);
  }

  idx(i: number, j: number) {
    return j * this.n + i;
  }

  /** Grid coordinates of a world position. */
  gx(x: number) {
    return (x + HALF) / GRID_RES;
  }
  gz(z: number) {
    return (z + HALF) / GRID_RES;
  }
  wx(i: number) {
    return i * GRID_RES - HALF;
  }
  wz(j: number) {
    return j * GRID_RES - HALF;
  }

  get(i: number, j: number) {
    const n = this.n;
    i = i < 0 ? 0 : i >= n ? n - 1 : i;
    j = j < 0 ? 0 : j >= n ? n - 1 : j;
    return this.h[j * n + i];
  }

  heightAt(x: number, z: number): number {
    const fx = this.gx(x), fz = this.gz(z);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const h00 = this.get(i, j), h10 = this.get(i + 1, j), h01 = this.get(i, j + 1), h11 = this.get(i + 1, j + 1);
    // two triangles split along (0,0)-(1,1)
    if (u >= v) return h00 + (h10 - h00) * u + (h11 - h10) * v;
    return h00 + (h11 - h01) * u + (h01 - h00) * v;
  }

  normalAt(x: number, z: number, out: Vector3): Vector3 {
    const fx = this.gx(x), fz = this.gz(z);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const h00 = this.get(i, j), h10 = this.get(i + 1, j), h01 = this.get(i, j + 1), h11 = this.get(i + 1, j + 1);
    const r = GRID_RES;
    if (u >= v) out.set(-(h10 - h00) / r, 1, -(h11 - h10) / r);
    else out.set(-(h11 - h01) / r, 1, -(h01 - h00) / r);
    return out.normalize();
  }

  /** Smooth (bilinear-gradient) normal for shading. */
  smoothNormal(i: number, j: number, out: Vector3): Vector3 {
    const r = GRID_RES * 2;
    out.set(this.get(i - 1, j) - this.get(i + 1, j), r, this.get(i, j - 1) - this.get(i, j + 1));
    return out.normalize();
  }

  surfaceAt(x: number, z: number): Surface {
    const i = Math.round(this.gx(x)), j = Math.round(this.gz(z));
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return Surface.Sand;
    return this.surf[j * this.n + i] as Surface;
  }
}
