import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Shape, ShapeGeometry, SRGBColorSpace, Vector2, Vector3 } from 'three';
import type { SurfacePoint } from './BodyGeometry';

/**
 * Conforming body details: 2D outlines (lamps, grilles, door gaps, handles...) are triangulated,
 * subdivided and projected onto the curved body surface, so every detail follows the bodywork
 * instead of being a box stuck on it.
 */
export type Projector = (a: number, b: number, out: SurfacePoint) => SurfacePoint | null;

const _sp: SurfacePoint = { p: new Vector3(), n: new Vector3() };

/** Split triangles until no 2D edge is longer than maxEdge (keeps the projected patch on the curved surface). */
function subdivide(tris: number[], maxEdge: number): number[] {
  let cur = tris;
  for (let pass = 0; pass < 6; pass++) {
    const next: number[] = [];
    let split = false;
    for (let i = 0; i < cur.length; i += 6) {
      const ax = cur[i], ay = cur[i + 1], bx = cur[i + 2], by = cur[i + 3], cx = cur[i + 4], cy = cur[i + 5];
      const lab = Math.hypot(bx - ax, by - ay), lbc = Math.hypot(cx - bx, cy - by), lca = Math.hypot(ax - cx, ay - cy);
      const m = Math.max(lab, lbc, lca);
      if (m <= maxEdge) {
        next.push(ax, ay, bx, by, cx, cy);
        continue;
      }
      split = true;
      // split the longest edge
      if (m === lab) {
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        next.push(ax, ay, mx, my, cx, cy, mx, my, bx, by, cx, cy);
      } else if (m === lbc) {
        const mx = (bx + cx) / 2, my = (by + cy) / 2;
        next.push(ax, ay, bx, by, mx, my, ax, ay, mx, my, cx, cy);
      } else {
        const mx = (cx + ax) / 2, my = (cy + ay) / 2;
        next.push(ax, ay, bx, by, mx, my, mx, my, bx, by, cx, cy);
      }
    }
    cur = next;
    if (!split) break;
  }
  return cur;
}

export interface DecalOptions {
  offset?: number;
  maxEdge?: number;
  /** UV: 'box' maps the shape's bounding box to 0..1 (for lamp/grille textures); a number = fixed atlas uv */
  uv?: 'box' | [number, number];
  /** Also emit the mirrored copy (x -> -x) for symmetric details. */
  mirror?: boolean;
  /** flip the texture horizontally (front projections: the car's right side is on the viewer's left) */
  flipU?: boolean;
  /** Projector space axis that maps to world x (front/rear/top: 'a'; side projections are mirrored in x directly). */
}

/**
 * Project a 2D shape (in projector coordinates) onto the body. Vertices that miss the body are dropped
 * together with their triangles. Triangles are oriented to face along the surface normal.
 */
export function projectShape(shape: Shape | Vector2[], project: Projector, o: DecalOptions = {}): BufferGeometry | null {
  const offset = o.offset ?? 0.004;
  const sg = new ShapeGeometry(shape instanceof Shape ? shape : new Shape(shape), 6);
  const idx = sg.index!;
  const sp = sg.getAttribute('position');
  const flat: number[] = [];
  for (let i = 0; i < idx.count; i++) {
    const k = idx.getX(i);
    flat.push(sp.getX(k), sp.getY(k));
  }
  sg.dispose();
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    minA = Math.min(minA, flat[i]);
    maxA = Math.max(maxA, flat[i]);
    minB = Math.min(minB, flat[i + 1]);
    maxB = Math.max(maxB, flat[i + 1]);
  }
  const tris = subdivide(flat, o.maxEdge ?? 0.025);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const cache = new Map<string, [number, number, number, number, number, number] | null>();
  const proj = (a: number, b: number) => {
    const key = `${a.toFixed(5)},${b.toFixed(5)}`;
    let r = cache.get(key);
    if (r === undefined) {
      const s = project(a, b, _sp);
      r = s ? [s.p.x + s.n.x * offset, s.p.y + s.n.y * offset, s.p.z + s.n.z * offset, s.n.x, s.n.y, s.n.z] : null;
      cache.set(key, r);
    }
    return r;
  };
  const e1 = new Vector3(), e2 = new Vector3(), fn = new Vector3();
  for (let i = 0; i < tris.length; i += 6) {
    const v = [proj(tris[i], tris[i + 1]), proj(tris[i + 2], tris[i + 3]), proj(tris[i + 4], tris[i + 5])];
    if (!v[0] || !v[1] || !v[2]) continue;
    e1.set(v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]);
    e2.set(v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]);
    fn.crossVectors(e1, e2);
    const facing = fn.x * (v[0][3] + v[1][3] + v[2][3]) + fn.y * (v[0][4] + v[1][4] + v[2][4]) + fn.z * (v[0][5] + v[1][5] + v[2][5]);
    const order = facing >= 0 ? [0, 1, 2] : [0, 2, 1];
    for (const k of order) {
      const q = v[k]!;
      pos.push(q[0], q[1], q[2]);
      nor.push(q[3], q[4], q[5]);
      const a = tris[i + k * 2], b = tris[i + k * 2 + 1];
      if (o.uv === 'box' || o.uv === undefined) {
        const u = (a - minA) / Math.max(1e-6, maxA - minA);
        uv.push(o.flipU ? 1 - u : u, (b - minB) / Math.max(1e-6, maxB - minB));
      }
      else uv.push(o.uv[0], o.uv[1]);
    }
  }
  if (!pos.length) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

/** A thin strip along a polyline (projector coordinates), e.g. panel gaps and trims. */
export function projectStrip(path: [number, number][], width: number, project: Projector, o: DecalOptions = {}): BufferGeometry | null {
  // resample the path so the strip follows the curvature
  const pts: [number, number][] = [];
  const step = o.maxEdge ?? 0.02;
  for (let i = 0; i < path.length - 1; i++) {
    const [a0, b0] = path[i], [a1, b1] = path[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(a1 - a0, b1 - b0) / step));
    for (let k = 0; k < n; k++) pts.push([a0 + ((a1 - a0) * k) / n, b0 + ((b1 - b0) * k) / n]);
  }
  pts.push(path[path.length - 1]);
  const outline: Vector2[] = [];
  const left: Vector2[] = [], right: Vector2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    left.push(new Vector2(pts[i][0] - dy * width * 0.5, pts[i][1] + dx * width * 0.5));
    right.push(new Vector2(pts[i][0] + dy * width * 0.5, pts[i][1] - dx * width * 0.5));
  }
  outline.push(...left, ...right.reverse());
  return projectShape(outline, project, { ...o, maxEdge: Math.max(step, width) });
}

/** Rounded rectangle centred at (cx, cy). */
export function roundRect(cx: number, cy: number, w: number, h: number, r: number, slant = 0): Shape {
  const s = new Shape();
  const x0 = cx - w / 2, y0 = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  // slant shears the shape: top edge shifted by +slant*h/2, bottom by -slant*h/2
  const P = (x: number, y: number): [number, number] => [x + (y - cy) * slant, y];
  s.moveTo(...P(x0 + r, y0));
  s.lineTo(...P(x0 + w - r, y0));
  s.quadraticCurveTo(...P(x0 + w, y0), ...P(x0 + w, y0 + r));
  s.lineTo(...P(x0 + w, y0 + h - r));
  s.quadraticCurveTo(...P(x0 + w, y0 + h), ...P(x0 + w - r, y0 + h));
  s.lineTo(...P(x0 + r, y0 + h));
  s.quadraticCurveTo(...P(x0, y0 + h), ...P(x0, y0 + h - r));
  s.lineTo(...P(x0, y0 + r));
  s.quadraticCurveTo(...P(x0, y0), ...P(x0 + r, y0));
  return s;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, seg = 28): Vector2[] {
  const out: Vector2[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    out.push(new Vector2(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return out;
}

export function poly(pts: [number, number][]): Vector2[] {
  return pts.map(([a, b]) => new Vector2(a, b));
}

/** Offset a convex-ish polygon outwards (bezel around a lamp). */
export function grow(pts: Vector2[], d: number): Vector2[] {
  let cx = 0, cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    let nx = b.y - a.y, ny = -(b.x - a.x);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    // make the normal point away from the centroid
    if (nx * (p.x - cx) + ny * (p.y - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return new Vector2(p.x + nx * d, p.y + ny * d);
  });
}

export function shapePoints(s: Shape, div = 24): Vector2[] {
  return s.getPoints(div);
}

// ------------------------------------------------------------------ lamp & grille textures

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c: HTMLCanvasElement, srgb = true) {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const cache = new Map<string, { map: CanvasTexture; emissive: CanvasTexture }>();

/**
 * Headlight lens textures. `map` is what you see in daylight (chrome reflectors, projector lenses, dark housing),
 * `emissive` marks the parts that light up at night (projectors and reflector cups).
 */
export function headlightTextures(style: string): { map: CanvasTexture; emissive: CanvasTexture } {
  const key = 'head:' + style;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 256, H = 128;
  const c = canvas(W, H), e = canvas(W, H);
  const g = c.getContext('2d')!, ge = e.getContext('2d')!;
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  // housing: brushed dark chrome with a top highlight
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#5b6168');
  bg.addColorStop(0.18, '#2a2e33');
  bg.addColorStop(0.7, '#15171a');
  bg.addColorStop(1, '#0b0c0e');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(255,255,255,${0.02 + (i % 3) * 0.01})`;
    g.fillRect(0, (i / 18) * H, W, 1);
  }
  const projector = (x: number, y: number, r: number) => {
    // chrome bowl
    const rg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    rg.addColorStop(0, '#f4f6f8');
    rg.addColorStop(0.45, '#9aa2aa');
    rg.addColorStop(0.8, '#3b4046');
    rg.addColorStop(1, '#1a1c1f');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    // lens
    const lg = g.createRadialGradient(x - r * 0.15, y - r * 0.2, 1, x, y, r * 0.55);
    lg.addColorStop(0, '#ffffff');
    lg.addColorStop(0.3, '#c9d6e2');
    lg.addColorStop(1, '#20262c');
    g.fillStyle = lg;
    g.beginPath();
    g.arc(x, y, r * 0.55, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y, r * 0.58, 0, Math.PI * 2);
    g.stroke();
    const eg = ge.createRadialGradient(x, y, 0, x, y, r);
    eg.addColorStop(0, '#ffffff');
    eg.addColorStop(0.6, '#e8eef5');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    ge.fillStyle = eg;
    ge.beginPath();
    ge.arc(x, y, r, 0, Math.PI * 2);
    ge.fill();
  };
  const reflector = (x: number, y: number, r: number) => {
    const rg = g.createRadialGradient(x, y, 2, x, y, r);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.25, '#cfd5db');
    rg.addColorStop(0.6, '#7b838b');
    rg.addColorStop(1, '#2b2f34');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.arc(x, y, (r * k) / 4, 0, Math.PI * 2);
      g.stroke();
    }
    // fluted lens lines
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    for (let k = -r; k < r; k += 6) {
      g.beginPath();
      g.moveTo(x + k, y - r);
      g.lineTo(x + k, y + r);
      g.stroke();
    }
    const eg = ge.createRadialGradient(x, y, 0, x, y, r);
    eg.addColorStop(0, '#ffffff');
    eg.addColorStop(0.7, '#f2f4f7');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    ge.fillStyle = eg;
    ge.beginPath();
    ge.arc(x, y, r, 0, Math.PI * 2);
    ge.fill();
  };
  switch (style) {
    case 'round':
      reflector(W / 2, H / 2, H * 0.48);
      break;
    case 'quad':
      reflector(W * 0.27, H / 2, H * 0.42);
      reflector(W * 0.73, H / 2, H * 0.42);
      break;
    case 'square':
      reflector(W * 0.3, H * 0.5, H * 0.36);
      projector(W * 0.7, H * 0.5, H * 0.3);
      break;
    case 'slim':
      projector(W * 0.3, H * 0.52, H * 0.34);
      projector(W * 0.62, H * 0.52, H * 0.3);
      break;
    case 'led': {
      // a row of LED matrix cubes
      for (let k = 0; k < 5; k++) {
        const x = W * (0.18 + k * 0.13), y = H * 0.5;
        g.fillStyle = '#0d0f12';
        g.fillRect(x - 13, y - 14, 26, 28);
        const lg = g.createRadialGradient(x, y, 1, x, y, 12);
        lg.addColorStop(0, '#ffffff');
        lg.addColorStop(0.5, '#a9b6c4');
        lg.addColorStop(1, '#1c2229');
        g.fillStyle = lg;
        g.fillRect(x - 11, y - 11, 22, 22);
        ge.fillStyle = '#ffffff';
        ge.fillRect(x - 10, y - 10, 20, 20);
      }
      break;
    }
    case 'wide':
    default:
      projector(W * 0.28, H * 0.5, H * 0.36);
      reflector(W * 0.66, H * 0.5, H * 0.34);
  }
  // clear outer lens edge highlight
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, W - 3, H - 3);
  const r = { map: tex(c), emissive: tex(e) };
  cache.set(key, r);
  return r;
}

/** Tail light lens: deep red with LED graphics; emissive marks the light-emitting elements. */
export function taillightTextures(style: string): { map: CanvasTexture; emissive: CanvasTexture } {
  const key = 'tail:' + style;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 256, H = 64;
  const c = canvas(W, H), e = canvas(W, H);
  const g = c.getContext('2d')!, ge = e.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#7a0b10');
  bg.addColorStop(0.5, '#3d0306');
  bg.addColorStop(1, '#22010a');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  ge.fillStyle = '#1a0000';
  ge.fillRect(0, 0, W, H);
  // smoked inner chambers
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(W * 0.04, H * 0.18, W * 0.92, H * 0.64);
  const led = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    for (const [ctx, col] of [[g, '#ff5a5a'], [ge, '#ffffff']] as [CanvasRenderingContext2D, string][]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  };
  switch (style) {
    case 'round': {
      for (const [ctx, col] of [[g, '#ff4d4d'], [ge, '#ffffff']] as [CanvasRenderingContext2D, string][]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, H * 0.32, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'bar':
      led(8, H * 0.5, W - 8, H * 0.5, 7);
      led(8, H * 0.25, W * 0.3, H * 0.25, 3);
      break;
    case 'split':
      led(W * 0.08, H * 0.35, W * 0.92, H * 0.35, 6);
      led(W * 0.08, H * 0.65, W * 0.6, H * 0.65, 4);
      led(W * 0.88, H * 0.35, W * 0.88, H * 0.85, 5);
      break;
    case 'vertical':
      for (let k = 0; k < 4; k++) led(W * 0.2, H * (0.2 + k * 0.2), W * 0.8, H * (0.2 + k * 0.2), 5);
      break;
    case 'wide':
    default:
      led(W * 0.06, H * 0.3, W * 0.94, H * 0.3, 5);
      led(W * 0.06, H * 0.7, W * 0.94, H * 0.7, 5);
      for (let k = 0; k < 6; k++) led(W * (0.15 + k * 0.14), H * 0.3, W * (0.15 + k * 0.14), H * 0.7, 2);
  }
  // glossy lens reflection
  const hl = g.createLinearGradient(0, 0, 0, H * 0.4);
  hl.addColorStop(0, 'rgba(255,255,255,0.28)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, W, H * 0.4);
  const r = { map: tex(c), emissive: tex(e) };
  cache.set(key, r);
  return r;
}

/** Grille inserts: honeycomb, mesh, horizontal slats or chrome bars. */
export function grilleTexture(style: string): CanvasTexture {
  const key = 'grille:' + style;
  const hit = cache.get(key);
  if (hit) return hit.map;
  const W = 256, H = 128;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  g.fillStyle = '#060607';
  g.fillRect(0, 0, W, H);
  if (style === 'chrome' || style === 'tall') {
    for (let y = 8; y < H; y += 16) {
      const gr = g.createLinearGradient(0, y, 0, y + 7);
      gr.addColorStop(0, '#f5f7f9');
      gr.addColorStop(0.5, '#9aa1a8');
      gr.addColorStop(1, '#2d3136');
      g.fillStyle = gr;
      g.fillRect(4, y, W - 8, 7);
    }
    if (style === 'tall')
      for (let x = 12; x < W; x += 24) {
        g.fillStyle = '#c9ced3';
        g.fillRect(x, 0, 4, H);
      }
  } else if (style === 'split' || style === 'small') {
    for (let y = 6; y < H; y += 12) {
      g.fillStyle = '#26282c';
      g.fillRect(0, y, W, 5);
      g.fillStyle = '#3a3d42';
      g.fillRect(0, y, W, 1);
    }
  } else {
    // hexagonal mesh
    const r = 7;
    for (let row = 0; row * r * 1.5 < H + r; row++)
      for (let col = 0; col * r * 1.75 < W + r; col++) {
        const x = col * r * 1.75 + (row % 2 ? r * 0.87 : 0), y = row * r * 1.5;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fillStyle = '#000';
        g.fill();
        g.strokeStyle = '#2b2e33';
        g.lineWidth = 2;
        g.stroke();
      }
  }
  const t = tex(c);
  cache.set(key, { map: t, emissive: t });
  return t;
}

/** Number plate (front/rear). */
export function plateTexture(): CanvasTexture {
  const hit = cache.get('plate');
  if (hit) return hit.map;
  const c = canvas(256, 56);
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f2ec';
  g.fillRect(0, 0, 256, 56);
  g.fillStyle = '#1d3d8f';
  g.fillRect(0, 0, 22, 56);
  g.fillStyle = '#ffd400';
  g.font = 'bold 10px sans-serif';
  g.fillText('MW', 4, 46);
  g.strokeStyle = '#111';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 253, 53);
  g.fillStyle = '#151515';
  g.font = 'bold 34px "JetBrains Mono", monospace';
  g.textBaseline = 'middle';
  g.fillText('0420 MWR', 34, 30);
  const t = tex(c);
  cache.set('plate', { map: t, emissive: t });
  return t;
}
