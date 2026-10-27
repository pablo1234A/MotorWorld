import { Box3, Camera, Matrix4, Object3D, Vector3 } from 'three';

/**
 * Conservative software occlusion culling.
 * Large nearby buildings are rasterised (their exact convex screen hull, at their farthest depth)
 * into a tiny depth buffer; chunk groups whose screen rectangle is entirely behind occluders are hidden.
 * Cost is a few thousand pixel writes per frame, it saves whole chunks of draw calls in the city.
 */
export class Occlusion {
  private W = 96;
  private H = 54;
  private depth: Float32Array;
  private vp = new Matrix4();
  private tmp = new Vector3();
  private corners: Vector3[] = Array.from({ length: 8 }, () => new Vector3());
  enabled = true;
  culled = 0;

  constructor() {
    this.depth = new Float32Array(this.W * this.H);
  }

  /** Project a world point; returns NDC x,y and view-space distance (Infinity if behind camera). */
  private project(p: Vector3, out: Vector3): boolean {
    out.copy(p).applyMatrix4(this.vp);
    const e = this.vp.elements;
    const w = e[3] * p.x + e[7] * p.y + e[11] * p.z + e[15];
    if (w <= 0.1) return false;
    out.z = w;
    return true;
  }

  begin(camera: Camera) {
    this.vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.depth.fill(Infinity);
    this.culled = 0;
  }

  /** Rasterise a box occluder (axis-aligned in Y, rotated in XZ). */
  addBox(cx: number, y0: number, cz: number, hx: number, h: number, hz: number, rot: number) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts: [number, number][] = [];
    let far = 0;
    for (let k = 0; k < 8; k++) {
      const lx = k & 1 ? hx : -hx, lz = k & 2 ? hz : -hz, y = k & 4 ? y0 + h : y0;
      this.tmp.set(cx + lx * c + lz * s, y, cz - lx * s + lz * c);
      const out = this.corners[k];
      if (!this.project(this.tmp, out)) return; // partially behind the camera: skip (conservative)
      far = Math.max(far, out.z);
      pts.push([((out.x + 1) / 2) * this.W, ((1 - out.y) / 2) * this.H]);
    }
    const hull = convexHull(pts);
    this.fillPolygon(hull, far);
  }

  private fillPolygon(poly: [number, number][], d: number) {
    if (poly.length < 3) return;
    let minY = Infinity, maxY = -Infinity;
    for (const p of poly) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    const y0 = Math.max(0, Math.ceil(minY)), y1 = Math.min(this.H - 1, Math.floor(maxY));
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5;
      let xl = Infinity, xr = -Infinity;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
          const x = a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
          xl = Math.min(xl, x);
          xr = Math.max(xr, x);
        }
      }
      // shrink by one pixel: only fully covered pixels count
      const x0 = Math.max(0, Math.ceil(xl + 0.5)), x1 = Math.min(this.W - 1, Math.floor(xr - 0.5));
      for (let x = x0; x <= x1; x++) {
        const i = y * this.W + x;
        if (d < this.depth[i]) this.depth[i] = d;
      }
    }
  }

  /** Is the box fully hidden behind occluders? */
  occluded(box: Box3): boolean {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, near = Infinity;
    for (let k = 0; k < 8; k++) {
      this.tmp.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z);
      const out = this.corners[k];
      if (!this.project(this.tmp, out)) return false;
      near = Math.min(near, out.z);
      const sx = ((out.x + 1) / 2) * this.W, sy = ((1 - out.y) / 2) * this.H;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }
    const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(this.W - 1, Math.ceil(maxX));
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.H - 1, Math.ceil(maxY));
    if (x0 > x1 || y0 > y1) return false; // off-screen: frustum culling handles it
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (!(this.depth[y * this.W + x] < near)) return false;
    return true;
  }

  apply(obj: Object3D, box: Box3) {
    const hide = this.enabled && this.occluded(box);
    obj.visible = !hide;
    if (hide) this.culled++;
  }
}

function convexHull(p: [number, number][]): [number, number][] {
  const pts = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}
