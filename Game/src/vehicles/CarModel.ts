import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, Euler, Group, Material, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3,
} from 'three';
import { lerp } from '../core/MathUtil';
import type { BodyStyle } from './BodyStyle';
import { BodyProfile, buildBodyGeometry, type SurfacePoint } from './BodyGeometry';
import { ellipse, grow, poly, projectShape, projectStrip, roundRect, shapePoints, type Projector } from './CarDetails';
import { CELL, cellUV, createCarMaterials, updateLivery, type CarMaterials } from './CarMaterials';
import type { VisualConfig } from './Tuning';
import { buildWheel, mergeParts } from './WheelBuilder';

const m4 = new Matrix4();
const q = new Quaternion();
const v3 = new Vector3();

export interface CarModelOptions {
  quality: number; // 0 low .. 3 ultra
  interior: boolean;
  /** Tuning-driven aero visuals */
  wingLevel: number;
  splitterLevel: number;
  diffuserLevel: number;
}

export interface WheelVisual {
  root: Group;
  spinner: Group;
  front: boolean;
  left: boolean;
}

function solid(g: BufferGeometry, cell: number) {
  return cellUV(g.index ? g.toNonIndexed() : g, cell);
}

function place(g: BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): BufferGeometry {
  if (rx || ry || rz) {
    q.setFromEuler(new Euler(rx, ry, rz));
    g.applyMatrix4(m4.makeRotationFromQuaternion(q));
  }
  g.applyMatrix4(m4.makeTranslation(x, y, z));
  return g;
}

/** Mirror a geometry across X (for left/right symmetric parts). */
function mirrored(g: BufferGeometry): BufferGeometry {
  const c = g.clone();
  c.applyMatrix4(m4.makeScale(-1, 1, 1));
  // fix winding
  const pos = c.getAttribute('position');
  const nor = c.getAttribute('normal');
  const uv = c.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 3) {
    for (const attr of [pos, nor, uv]) {
      if (!attr) continue;
      const s = attr.itemSize;
      for (let k = 0; k < s; k++) {
        const a = attr.array[(i + 1) * s + k];
        (attr.array as Float32Array)[(i + 1) * s + k] = attr.array[(i + 2) * s + k];
        (attr.array as Float32Array)[(i + 2) * s + k] = a;
      }
    }
  }
  return c;
}

function both(parts: BufferGeometry[], g: BufferGeometry) {
  const ng = g.index ? g.toNonIndexed() : g;
  parts.push(ng, mirrored(ng));
}

/**
 * Procedurally generated car: body loft, glass, lights, details, interior and four wheels.
 * The model's local frame matches the physics body: origin at the centre of gravity.
 */
export class CarModel {
  readonly root = new Group();
  /** Body offset group (mesh origin = ground at wheelbase centre). */
  readonly bodyGroup = new Group();
  readonly wheels: WheelVisual[] = [];
  readonly mats: CarMaterials;
  readonly profile: BodyProfile;
  readonly headPos: Vector3[] = [];
  readonly tailPos: Vector3[] = [];
  steeringWheel: Mesh | null = null;
  /** geometry groups of the projected details (kept for the traffic instancer) */
  parts: { drl: BufferGeometry[]; indL: BufferGeometry[]; indR: BufferGeometry[]; rev: BufferGeometry[]; grille: BufferGeometry[]; plate: BufferGeometry[]; trim: BufferGeometry[] } | null = null;
  underglow: Mesh | null = null;
  private meshes: Mesh[] = [];
  /** Driver eye position in body-offset space. */
  readonly eye = new Vector3();
  readonly hoodCam = new Vector3();

  constructor(public readonly body: BodyStyle, public visual: VisualConfig, public opts: CarModelOptions) {
    const physical = opts.quality >= 2;
    this.mats = createCarMaterials(body, visual, physical, opts.quality >= 2 ? 1024 : 512);
    this.root.add(this.bodyGroup);
    const { geometry, profile } = buildBodyGeometry(body, opts.quality >= 2 ? 1 : opts.quality >= 1 ? 0.5 : 0);
    this.profile = profile;
    const bodyMesh = new Mesh(geometry, [this.mats.paint, this.mats.glass, this.mats.trim]);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = opts.quality >= 2;
    this.add(bodyMesh);
    this.buildDetails();
    this.buildWheels();
    this.eye.set(-body.trackF * 0.22, body.beltH + 0.12, profile.zAt(body.roofT0) + 0.35);
    this.hoodCam.set(0, body.hoodH + 0.25, profile.zAt(body.cowlT) - 0.1);
  }

  private add(m: Mesh) {
    this.meshes.push(m);
    this.bodyGroup.add(m);
  }

  /** Position the body inside root to align with the physics CG. */
  setPhysicsOffset(cgHeight: number, rideOffset: number, weightFront: number) {
    const a = this.body.wheelbase * (1 - weightFront);
    this.bodyGroup.position.set(0, -(cgHeight + rideOffset), this.body.wheelbase / 2 - a);
  }

  private buildDetails() {
    const b = this.body, p = this.profile;
    const detail: BufferGeometry[] = [];
    const paintParts: BufferGeometry[] = [];
    const head: BufferGeometry[] = [];
    const tail: BufferGeometry[] = [];
    const noseZ = p.zAt(0), tailZ = p.zAt(1);
    const v = this.visual;
    const paintUV = (g: BufferGeometry) => {
      const ng = g.index ? g.toNonIndexed() : g;
      const uv = ng.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.58);
      return ng;
    };

    // --- wheel well liners ---
    for (const az of [p.axleF, p.axleR]) {
      const t = p.tAt(az);
      const hw = p.halfWidth(t);
      const inner = Math.max((az < 0 ? b.trackF : b.trackR) / 2 - (az < 0 ? b.tireWidthF : b.tireWidthR) / 2 - 0.05, hw * 0.7);
      const len = Math.max(0.1, hw - inner);
      // lowest point of the body's upper surface above the liner: the liner must stay below it
      const sec = p.section(t, []);
      let skin = Infinity;
      for (let k = 7; k < sec.length / 2 - 1; k++) {
        const x0 = sec[k * 2], y0 = sec[k * 2 + 1], x1 = sec[k * 2 + 2], y1 = sec[k * 2 + 3];
        if (Math.max(x0, x1) >= inner && Math.min(x0, x1) <= hw) skin = Math.min(skin, y0, y1);
      }
      const archTop = Math.max(0.05, Math.min(p.archR, skin - b.wheelRadius - 0.09));
      const liner = new CylinderGeometry(p.archR, p.archR, len, 14, 1, true, 0, Math.PI);
      liner.applyMatrix4(m4.makeRotationZ(Math.PI / 2));
      liner.scale(1, archTop / p.archR, 1);
      // flip normals inward by using BackSide-equivalent: duplicate reversed faces
      const lg = solid(liner, CELL.soot);
      const rev = lg.clone();
      const pos = rev.getAttribute('position');
      for (let i = 0; i < pos.count; i += 3) {
        const x = pos.getX(i + 1), y = pos.getY(i + 1), z = pos.getZ(i + 1);
        pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
        pos.setXYZ(i + 2, x, y, z);
      }
      rev.computeVertexNormals();
      for (const g of [lg, rev]) {
        g.applyMatrix4(m4.makeTranslation(inner + len / 2, b.wheelRadius, az));
        both(detail, g);
      }
      // inner wall of the wheel well (kept below the hood line so it never pokes through)
      const capH = archTop;
      const cap = new CircleGeometry(p.archR, 10, 0, Math.PI);
      cap.scale(1, capH / p.archR, 1);
      cap.applyMatrix4(m4.makeRotationY(Math.PI / 2));
      cap.applyMatrix4(m4.makeTranslation(inner, b.wheelRadius, az));
      both(detail, solid(cap, CELL.soot));
    }

    // ================================================================ projected body details
    const sp: SurfacePoint = { p: new Vector3(), n: new Vector3() };
    const FRONT: Projector = (x, y, o) => p.frontAt(x, y, o);
    const REAR: Projector = (x, y, o) => p.rearAt(x, y, o);
    const SIDE: Projector = (z, y, o) => p.sideAt(z, y, o);
    const TOP: Projector = (x, z, o) => p.topAt(x, z, o);
    const drl: BufferGeometry[] = [], indL: BufferGeometry[] = [], indR: BufferGeometry[] = [], rev: BufferGeometry[] = [];
    const grille: BufferGeometry[] = [], plate: BufferGeometry[] = [], trim: BufferGeometry[] = [];
    this.parts = { drl, indL, indR, rev, grille, plate, trim };
    const atlasUV = (cell: number): [number, number] => [(cell % 4) / 4 + 0.125, 1 - (Math.floor(cell / 4) + 1) / 4 + 0.125];
    const SOOT = atlasUV(CELL.soot), CHROME = atlasUV(CELL.chrome), RED = atlasUV(CELL.reflector);
    /** push a projected right-side detail and its mirror image */
    const sym = (arr: BufferGeometry[] | [BufferGeometry[], BufferGeometry[]], g: BufferGeometry | null) => {
      if (!g) return;
      if (Array.isArray(arr[0])) {
        (arr as [BufferGeometry[], BufferGeometry[]])[0].push(g);
        (arr as [BufferGeometry[], BufferGeometry[]])[1].push(mirrored(g));
      } else (arr as BufferGeometry[]).push(g, mirrored(g));
    };
    const boxy = b.kind === 'bus' || b.kind === 'truck' || b.kind === 'van';
    const sporty = b.kind === 'mid' || b.kind === 'hyper' || b.kind === 'coupe' || b.kind === 'muscle';
    const classic = !!b.chromeBumpers;

    // ---------------------------------------------------------------- front
    const fy0 = p.bottom(0.05, false), fy1 = p.top(0.02);
    const fh = fy1 - fy0;
    const fw = p.halfWidth(0.07) * Math.min(1, p.endScale(0.07) + 0.15);
    // headlights
    {
      const hs = b.headlight;
      const big = hs === 'round' || hs === 'square' || hs === 'quad';
      const lh = boxy ? 0.2 : hs === 'slim' ? 0.075 : hs === 'led' ? 0.062 : hs === 'wide' ? 0.12 : hs === 'round' ? (b.kind === 'offroad' ? 0.22 : 0.17) : hs === 'quad' ? 0.13 : 0.16;
      const lw = hs === 'round' ? lh : hs === 'quad' ? 0.3 : hs === 'square' ? 0.3 : hs === 'slim' ? Math.min(0.44, fw * 0.5) : hs === 'led' ? Math.min(0.46, fw * 0.52) : 0.38;
      const cx = Math.min(fw * 0.93 - lw / 2, fw * (big ? 0.62 : 0.6));
      const cy = boxy ? fy0 + fh * 0.55 : fy1 - lh / 2 - (big ? 0.06 : 0.035) - (hs === 'led' || hs === 'slim' ? 0 : 0.01);
      let outline: Vector2[];
      if (hs === 'round') outline = ellipse(cx, cy, lh / 2, lh / 2);
      else if (hs === 'quad') outline = shapePoints(roundRect(cx, cy, lw, lh, lh / 2));
      else if (hs === 'square') outline = shapePoints(roundRect(cx, cy, lw, lh, 0.02));
      else if (hs === 'wide') outline = shapePoints(roundRect(cx, cy, lw, lh, 0.035, 0.12));
      else {
        // slim / led: sharp, rising towards the outer corner
        const x0 = cx - lw / 2, x1 = cx + lw / 2, y0 = cy - lh / 2, y1 = cy + lh / 2, rise = hs === 'led' ? 0.035 : 0.025;
        outline = poly([[x0, y0 + 0.008], [x0 + lw * 0.55, y0 - 0.004], [x1 - 0.02, y0 + rise], [x1, y1 + rise * 0.8], [x1 - lw * 0.25, y1 + 0.012], [x0 + 0.03, y1]]);
      }
      sym(trim, projectShape(grow(outline, 0.014), FRONT, { offset: 0.003, uv: [0.5, 0.5] }));
      sym(classic ? detail : trim, classic ? projectShape(grow(outline, 0.022), FRONT, { offset: 0.002, uv: CHROME }) : null);
      sym(head, projectShape(outline, FRONT, { offset: 0.007, uv: 'box' }));
      const c = p.frontAt(cx, cy, sp);
      if (c) this.headPos.push(c.p.clone().setZ(c.p.z - 0.02), c.p.clone().setX(-c.p.x).setZ(c.p.z - 0.02));
      // daytime running light signature
      if (hs === 'led' || hs === 'slim' || hs === 'wide') {
        const x0 = cx - lw / 2, x1 = cx + lw / 2, y0 = cy - lh / 2;
        const path: [number, number][] = hs === 'wide' ? [[x0 + 0.03, y0 + 0.012], [x1 - 0.02, y0 + 0.02], [x1 - 0.01, cy + lh * 0.3]] : [[x0 + 0.02, y0 + 0.004], [x0 + lw * 0.55, y0 - 0.008], [x1 - 0.03, y0 + 0.02]];
        sym(drl, projectStrip(path, 0.012, FRONT, { offset: 0.011, uv: [0.5, 0.5] }));
        if (hs === 'led') sym(drl, projectStrip([[x1 - 0.06, y0 + 0.028], [x1 - 0.03, cy + 0.03]], 0.01, FRONT, { offset: 0.011, uv: [0.5, 0.5] }));
      }
      // front indicators: amber segment at the outer end of the lamp, or a separate lamp below
      const ind = big || boxy ? shapePoints(roundRect(cx, cy - lh / 2 - 0.045, Math.min(0.14, lw), 0.035, 0.012)) : shapePoints(roundRect(cx + lw / 2 - 0.045, cy + 0.006, 0.06, lh * 0.5, 0.01));
      sym([indR, indL], projectShape(ind, FRONT, { offset: big || boxy ? 0.006 : 0.012, uv: [0.5, 0.5] }));
      if (big || boxy) sym(trim, projectShape(grow(ind, 0.008), FRONT, { offset: 0.003, uv: [0.5, 0.5] }));
    }
    // grille & intakes
    const gTop = boxy ? fy0 + fh * 0.48 : fy1 - 0.06;
    {
      const gs = b.grille;
      const gw = gs === 'split' ? 0.2 : gs === 'small' ? fw * 0.55 : gs === 'tall' ? fw * 0.78 : gs === 'mesh' ? fw * 0.62 : fw * 0.6;
      const gh = gs === 'tall' ? fh * 0.42 : gs === 'small' ? 0.06 : gs === 'mesh' ? fh * 0.38 : gs === 'split' ? fh * 0.3 : fh * 0.24;
      const gy = boxy ? fy0 + fh * 0.6 : gTop - gh / 2 - (gs === 'small' ? 0.02 : 0.04);
      const outlines: Vector2[][] = [];
      if (gs === 'split') for (const sx of [-1, 1]) outlines.push(shapePoints(roundRect(sx * 0.13, gy, gw, gh, 0.05)));
      else if (gs === 'mesh') outlines.push(poly([[-gw, gy + gh / 2], [gw, gy + gh / 2], [gw * 0.88, gy - gh / 2], [-gw * 0.88, gy - gh / 2]]));
      else if (gs !== 'none') outlines.push(shapePoints(roundRect(0, gy, gw * 2, gh, gs === 'chrome' ? 0.02 : 0.04)));
      for (const o of outlines) {
        const surround = projectShape(grow(o, gs === 'chrome' || gs === 'tall' || gs === 'split' ? 0.016 : 0.01), FRONT, { offset: 0.002, uv: gs === 'chrome' || gs === 'tall' || gs === 'split' ? CHROME : SOOT });
        if (surround) detail.push(surround);
        const gg = projectShape(o, FRONT, { offset: 0.004, uv: 'box' });
        if (gg) grille.push(gg);
      }
      // badge
      const by = gs === 'none' ? gTop - 0.02 : gy + (outlines.length ? 0 : 0);
      const badge = projectShape(ellipse(0, by, 0.045, 0.028, 20), FRONT, { offset: 0.009, uv: CHROME });
      if (badge) detail.push(badge);
    }
    {
      // lower intake across the bumper (bigger with the aero bumpers)
      const lvl = v.frontBumper;
      const iw = fw * (lvl === 2 ? 0.86 : lvl === 1 ? 0.78 : sporty ? 0.74 : 0.58);
      const ih = fh * (lvl === 2 ? 0.28 : sporty ? 0.24 : 0.17);
      const iy = fy0 + 0.06 + ih / 2;
      const o = sporty || lvl > 0 ? poly([[-iw, iy + ih / 2], [iw, iy + ih / 2], [iw * 0.92, iy - ih / 2], [-iw * 0.92, iy - ih / 2]]) : shapePoints(roundRect(0, iy, iw * 2, ih, 0.03));
      const gg = projectShape(o, FRONT, { offset: 0.006, uv: 'box' });
      if (gg) grille.push(gg);
      // corner intakes / fog lamps
      if (!boxy) {
        const cx = fw * 0.8, cy = iy + ih * 0.15;
        const co = poly([[cx - 0.1, cy + 0.06], [cx + 0.08, cy + 0.07], [cx + 0.1, cy - 0.05], [cx - 0.07, cy - 0.06]]);
        sym(trim, projectShape(co, FRONT, { offset: 0.003, uv: [0.5, 0.5] }));
        if (!sporty) sym(head, projectShape(ellipse(cx, cy, 0.035, 0.035, 16), FRONT, { offset: 0.007, uv: 'box' }));
        else if (lvl > 0) sym(grille, projectShape(grow(co, -0.012), FRONT, { offset: 0.005, uv: 'box' }));
      }
      // front plate
      if (b.kind !== 'hyper' && b.kind !== 'mid') {
        const py = Math.min(iy + ih / 2 + 0.075, gTop - 0.12);
        const pg = projectShape(shapePoints(roundRect(0, py, 0.5, 0.11, 0.01)), FRONT, { offset: 0.008, uv: 'box', maxEdge: 0.05, flipU: true });
        if (pg) plate.push(pg);
      }
    }
    // splitter
    if (this.opts.splitterLevel > 0 || v.frontBumper === 2) {
      const ext = 0.04 + 0.03 * this.opts.splitterLevel;
      const g = new BoxGeometry(fw * 2 * 0.98, 0.018, ext + 0.15);
      detail.push(place(cellUV(g.toNonIndexed(), CELL.carbon, true), 0, b.clearance + 0.03, noseZ + 0.08 - ext));
    }
    if (b.lightBar) {
      const lb = new BoxGeometry(1.1, 0.08, 0.22);
      detail.push(place(solid(lb, CELL.gloss), 0, b.roofH + 0.05, p.zAt((b.roofT0 + b.roofT1) / 2)));
      for (const sx of [-1, 1]) {
        const lens = new BoxGeometry(0.45, 0.07, 0.2);
        const ng = place(lens.toNonIndexed(), sx * 0.26, b.roofH + 0.06, p.zAt((b.roofT0 + b.roofT1) / 2));
        cellUV(ng, CELL.gloss);
        (sx < 0 ? tail : head).push(ng);
      }
    }

    // ---------------------------------------------------------------- rear
    const ry0 = p.bottom(0.97, false), ry1 = p.top(0.985);
    const rh = ry1 - ry0;
    const rw = p.halfWidth(0.95) * Math.min(1, p.endScale(0.95) + 0.1);
    const tY = ry0 + rh * (boxy ? 0.25 : b.kind === 'offroad' || b.kind === 'suv' ? 0.62 : 0.68);
    {
      const ts = b.taillight;
      const outlines: Vector2[][] = [];
      let lampX0 = rw * 0.45;
      switch (ts) {
        case 'bar':
          outlines.push(poly([[0.0, tY - 0.022], [rw * 0.94, tY - 0.03], [rw * 0.95, tY + 0.035], [0.0, tY + 0.025]]));
          lampX0 = rw * 0.55;
          break;
        case 'round':
          outlines.push(ellipse(rw * 0.74, tY, 0.068, 0.068, 24), ellipse(rw * 0.74 - 0.17, tY, 0.068, 0.068, 24));
          lampX0 = rw * 0.74 - 0.17;
          break;
        case 'split':
          outlines.push(poly([[rw * 0.42, tY - 0.03], [rw * 0.95, tY - 0.045], [rw * 0.96, tY + 0.045], [rw * 0.42, tY + 0.035]]));
          outlines.push(shapePoints(roundRect(rw * 0.86, tY - 0.12, 0.09, 0.12, 0.015)));
          break;
        case 'vertical':
          outlines.push(shapePoints(roundRect(rw * 0.88, tY - 0.04, 0.1, 0.32, 0.03)));
          lampX0 = rw * 0.8;
          break;
        case 'wide':
        default:
          outlines.push(poly([[rw * 0.4, tY - 0.035], [rw * 0.94, tY - 0.05], [rw * 0.96, tY + 0.04], [rw * 0.4, tY + 0.045]]));
          // modern full-width light strip
          if (!classic && !boxy) outlines.push(poly([[0, tY - 0.01], [rw * 0.41, tY - 0.012], [rw * 0.41, tY + 0.012], [0, tY + 0.01]]));
      }
      for (const o of outlines) {
        const ctr = o.reduce((a, q) => a + q.x, 0) / o.length;
        const isCenter = ctr < rw * 0.25;
        if (isCenter) {
          const g = projectShape(o, REAR, { offset: 0.006, uv: 'box' });
          if (g) tail.push(g, mirrored(g));
          continue;
        }
        sym(trim, projectShape(grow(o, 0.012), REAR, { offset: 0.003, uv: [0.5, 0.5] }));
        sym(tail, projectShape(o, REAR, { offset: 0.007, uv: 'box' }));
      }
      const c = p.rearAt(rw * 0.75, tY, sp);
      if (c) this.tailPos.push(c.p.clone().setZ(c.p.z + 0.02), c.p.clone().setX(-c.p.x).setZ(c.p.z + 0.02));
      // reverse light and indicator inside the lamp cluster
      sym(rev, projectShape(shapePoints(roundRect(lampX0 + 0.06, tY - 0.005, 0.07, 0.03, 0.008)), REAR, { offset: 0.011, uv: [0.5, 0.5] }));
      const indO = ts === 'round' ? shapePoints(roundRect(rw * 0.74, tY - 0.1, 0.12, 0.028, 0.01)) : shapePoints(roundRect(rw * 0.86, tY + 0.012, 0.08, 0.024, 0.008));
      sym([indR, indL], projectShape(indO, REAR, { offset: ts === 'round' ? 0.006 : 0.011, uv: [0.5, 0.5] }));
      // trunk lid / tailgate gap
      if (!boxy) {
        const lidY = tY + (b.kind === 'hatch' || b.kind === 'suv' || b.kind === 'offroad' ? -0.11 : 0.07);
        const lx = rw * (b.kind === 'hatch' || b.kind === 'suv' || b.kind === 'offroad' ? 0.62 : 0.82);
        const lowY = ry0 + rh * 0.2;
        const gap = projectStrip([[-lx, lowY], [-lx, lidY], [lx, lidY], [lx, lowY]], 0.005, REAR, { offset: 0.0025, uv: SOOT });
        if (gap) detail.push(gap);
      }
    }
    // rear plate, lower bumper insert, reflectors
    {
      const py = ry0 + rh * 0.36;
      const pg = projectShape(shapePoints(roundRect(0, py, 0.5, 0.11, 0.01)), REAR, { offset: 0.008, uv: 'box', maxEdge: 0.05 });
      if (pg) plate.push(pg);
      const rec = projectShape(shapePoints(roundRect(0, py, 0.56, 0.15, 0.02)), REAR, { offset: 0.004, uv: [0.5, 0.5] });
      if (rec) trim.push(rec);
      const lowH = rh * 0.2;
      const low = poly([[-rw * 0.86, ry0 + 0.02], [rw * 0.86, ry0 + 0.02], [rw * 0.8, ry0 + lowH], [-rw * 0.8, ry0 + lowH]]);
      const lg = projectShape(low, REAR, { offset: 0.003, uv: [0.5, 0.5] });
      if (lg) trim.push(lg);
      sym(detail, projectShape(shapePoints(roundRect(rw * 0.84, ry0 + lowH + 0.03, 0.12, 0.022, 0.006)), REAR, { offset: 0.006, uv: RED }));
    }
    const diffLv = Math.max(this.opts.diffuserLevel, v.rearBumper);
    if (diffLv > 0) {
      const fins = 3 + diffLv;
      for (let i = 0; i < fins; i++) {
        const x = ((i / (fins - 1)) * 2 - 1) * rw * 0.6;
        const fin = new BoxGeometry(0.012, 0.1 + 0.03 * diffLv, 0.3);
        detail.push(place(solid(fin, CELL.carbon), x, b.clearance + 0.06, tailZ - 0.12));
      }
      const plateG = new BoxGeometry(rw * 1.5, 0.012, 0.32);
      detail.push(place(cellUV(plateG.toNonIndexed(), CELL.carbon, true), 0, b.clearance + 0.02, tailZ - 0.12, -0.15));
    }
    // exhausts, flush with the rounded rear bumper
    {
      const ex = b.exhaust;
      const exY = ry0 + 0.07;
      const exXs: number[] = [];
      if (ex.style === 'center') for (let i = 0; i < ex.count; i++) exXs.push((i - (ex.count - 1) / 2) * ex.spread);
      else if (ex.count === 1) exXs.push(rw * 0.55);
      else if (ex.count === 2) exXs.push(-rw * ex.spread, rw * ex.spread);
      else for (const s2 of [-1, 1]) exXs.push(s2 * rw * ex.spread, s2 * (rw * ex.spread - 0.11));
      for (const x of exXs) {
        const r = ex.style === 'square' ? 0.05 : b.kind === 'hyper' || b.kind === 'mid' ? 0.055 : 0.042;
        const at = p.rearAt(x, exY, sp);
        const z = at ? at.p.z - 0.05 : tailZ - 0.04;
        const tip = ex.style === 'square' ? new BoxGeometry(r * 2.4, r * 1.4, 0.16) : new CylinderGeometry(r, r * 0.92, 0.16, 18, 1, true).rotateX(Math.PI / 2);
        detail.push(place(solid(tip, ex.style === 'square' ? CELL.alu : CELL.chrome), x, exY, z));
        const inner = new CircleGeometry(r * 0.86, 16);
        detail.push(place(solid(inner, CELL.soot), x, exY, z + 0.055));
      }
    }

    // ---------------------------------------------------------------- sides
    if (!boxy || b.kind === 'van') {
      const zF = Math.max(p.axleF + p.archR + 0.07, p.zAt(b.cowlT) - 0.06);
      const fourDoor = b.bPillar > 0 && b.kind !== 'mid' && b.kind !== 'hyper' && b.kind !== 'coupe' && b.kind !== 'muscle';
      const zB = p.zAt(lerp(b.roofT0, b.roofT1, b.bPillar || 0.75));
      const zR = fourDoor ? Math.min(p.axleR - p.archR - 0.05, p.zAt(b.roofT1 + 0.02)) : Math.min(p.zAt(b.kind === 'mid' || b.kind === 'hyper' ? b.roofT1 - 0.02 : b.roofT1), p.axleR - p.archR - 0.08);
      const ySill = b.clearance + 0.13 + (b.kind === 'offroad' || b.kind === 'suv' ? 0.06 : 0);
      const yBelt = b.beltH - 0.012;
      const gaps: [number, number][][] = [[[zF, yBelt], [zF, ySill], [zR, ySill], [zR, yBelt]]];
      if (fourDoor) gaps.push([[zB, yBelt], [zB, ySill]]);
      for (const path of gaps) sym(detail, projectStrip(path, 0.005, SIDE, { offset: 0.0025, uv: SOOT }));
      // door handles
      const handleZ = fourDoor ? [zB - 0.14, zR - 0.14] : [zR - 0.16];
      for (const hz of handleZ) {
        const hg = projectShape(shapePoints(roundRect(hz, yBelt - 0.085, 0.14, 0.026, 0.012)), SIDE, { offset: 0.006, uv: classic ? CHROME : [0.5, 0.58] });
        if (hg) (classic ? detail : paintParts).push(hg, mirrored(hg));
        sym(detail, projectShape(shapePoints(roundRect(hz, yBelt - 0.085, 0.16, 0.04, 0.018)), SIDE, { offset: 0.002, uv: SOOT }));
      }
      // chrome belt line (classics) or side skirts
      if (classic) sym(detail, projectStrip([[zF, yBelt + 0.006], [zR + 0.3, yBelt + 0.006]], 0.014, SIDE, { offset: 0.004, uv: CHROME }));
      if (v.skirts > 0 || b.kind === 'hyper' || b.kind === 'mid' || sporty) {
        const z0 = p.axleF + p.archR + 0.04, z1 = p.axleR - p.archR - 0.04;
        sym(v.skirts > 0 ? detail : trim, projectStrip([[z0, b.clearance + 0.07], [z1, b.clearance + 0.07]], 0.07 + 0.02 * v.skirts, SIDE, { offset: 0.006 + 0.004 * v.skirts, uv: v.skirts > 0 ? atlasUV(CELL.carbon) : [0.5, 0.5] }));
      }
      // body cladding round the arches (SUV / off-road)
      if (b.kind === 'suv' || b.kind === 'offroad' || b.kind === 'pickup') {
        for (const az of [p.axleF, p.axleR]) {
          const arc: [number, number][] = [];
          for (let k = 0; k <= 16; k++) {
            const a2 = Math.PI * (0.06 + 0.88 * (k / 16));
            arc.push([az - Math.cos(a2) * (p.archR + 0.035), b.wheelRadius + Math.sin(a2) * (p.archR + 0.035)]);
          }
          sym(trim, projectStrip(arc, 0.065, SIDE, { offset: 0.006, uv: [0.5, 0.5] }));
        }
        sym(trim, projectStrip([[p.axleF + p.archR + 0.05, b.clearance + 0.12], [p.axleR - p.archR - 0.05, b.clearance + 0.12]], 0.1, SIDE, { offset: 0.006, uv: [0.5, 0.5] }));
      }
      // fuel filler door (right side only)
      const fz = p.axleR - p.archR - 0.12, fyy = b.beltH - 0.12;
      const fd = projectStrip([...ellipse(fz, fyy, 0.06, 0.06, 18).map((q) => [q.x, q.y] as [number, number]), [fz + 0.06, fyy]], 0.004, SIDE, { offset: 0.0025, uv: SOOT });
      if (fd) detail.push(fd);
      // side marker / indicator repeater on the front fender
      if (!sporty) sym([indR, indL], projectShape(shapePoints(roundRect(p.axleF + p.archR + 0.02, b.wheelRadius * 2 + 0.09, 0.07, 0.022, 0.01)), SIDE, { offset: 0.004, uv: [0.5, 0.5] }));
    }
    if (b.sideIntake) {
      const z1 = p.axleR - p.archR - 0.06;
      const o = poly([[z1 - 0.62, b.beltH - 0.06], [z1, b.beltH - 0.03], [z1, b.clearance + 0.24], [z1 - 0.34, b.clearance + 0.3]]);
      sym(trim, projectShape(grow(o, 0.012), SIDE, { offset: 0.002, uv: [0.5, 0.5] }));
      sym(grille, projectShape(o, SIDE, { offset: 0.004, uv: 'box' }));
    }

    // ---------------------------------------------------------------- top: hood shut lines, wipers, vents, antenna
    if (!boxy) {
      const zC = p.zAt(b.cowlT) - 0.035;
      const zN = noseZ + p.noseR * p.L + 0.05;
      const hx = p.halfWidth(b.cowlT * 0.5) * 0.8;
      const line = projectStrip([[-hx * 0.96, zN + 0.04], [-hx, zC], [hx, zC], [hx * 0.96, zN + 0.04]], 0.005, TOP, { offset: 0.0025, uv: SOOT, maxEdge: 0.03 });
      if (line) detail.push(line);
      // wipers resting on the base of the windscreen
      const zw = p.zAt(b.cowlT + 0.012);
      for (const x0 of [-0.04, -0.62]) {
        const wpr = projectStrip([[x0, zw], [x0 + 0.5, zw - 0.01]], 0.014, TOP, { offset: 0.012, uv: [0.5, 0.5], maxEdge: 0.03 });
        if (wpr) trim.push(wpr);
      }
      if (b.kind === 'hyper' || v.hood === 1) {
        const vz = p.zAt(b.cowlT * 0.62);
        for (const sx of [-1, 1]) {
          const vg = projectShape(shapePoints(roundRect(sx * hx * 0.45, vz, 0.2, 0.3, 0.04)), TOP, { offset: 0.004, uv: 'box' });
          if (vg) grille.push(vg);
        }
      }
      // shark-fin antenna
      if (b.kind !== 'classic' && b.kind !== 'offroad') {
        const at = p.topAt(0, p.zAt(b.roofT1 - 0.03), sp);
        const fin = new CylinderGeometry(0.004, 0.035, 0.06, 8, 1).scale(0.6, 1, 2.2);
        detail.push(place(solid(fin, CELL.gloss), 0, at.p.y + 0.028, at.p.z + 0.02));
      }
    }

    // ---------------------------------------------------------------- mirrors
    if (b.kind !== 'bus') {
      const mt = b.cowlT + 0.035;
      const mz = p.zAt(mt);
      const side = p.sideAt(mz, b.beltH + 0.02, sp);
      const mx = side.p.x + 0.11;
      const my = b.beltH + 0.075;
      const housing = new SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62).rotateX(-Math.PI / 2).scale(0.11, 0.07, 0.085);
      both(paintParts, place(paintUV(housing), mx, my, mz + 0.02));
      const glassM = new CircleGeometry(1, 18).scale(0.095, 0.058, 1);
      both(detail, place(solid(glassM, CELL.chrome), mx, my, mz + 0.022));
      const arm = new BoxGeometry(0.11, 0.025, 0.05);
      both(paintParts, place(paintUV(arm), mx - 0.08, my - 0.035, mz + 0.03));
      if (!classic && b.kind !== 'offroad') {
        const rep = new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(-Math.PI / 2).scale(0.06, 0.012, 0.02);
        const rg = place(rep.toNonIndexed(), mx + 0.04, my - 0.035, mz - 0.055);
        cellUV(rg, CELL.amber);
        indR.push(rg);
        indL.push(mirrored(rg));
      }
    }
    // chrome bumpers (classic)
    if (classic) {
      const fz = (p.frontAt(0, fy0 + fh * 0.3, sp)?.p.z ?? noseZ) - 0.025;
      const fb = new BoxGeometry(fw * 2.1, 0.075, 0.08);
      detail.push(place(solid(fb, CELL.chrome), 0, fy0 + fh * 0.3, fz));
      const rz = (p.rearAt(0, ry0 + rh * 0.22, sp)?.p.z ?? tailZ) + 0.025;
      const rb = new BoxGeometry(rw * 2.1, 0.075, 0.08);
      detail.push(place(solid(rb, CELL.chrome), 0, ry0 + rh * 0.22, rz));
    }
    // hood scoop / vented hood
    if (b.scoop || v.hood >= 1) {
      const st = b.cowlT * 0.55;
      const sw = b.kind === 'hyper' ? 0.5 : 0.42;
      const g = new BoxGeometry(sw, 0.06, 0.5);
      const ng = v.hood === 2 ? cellUV(g.toNonIndexed(), CELL.carbon, true) : paintUV(g);
      const placed = place(ng, 0, p.top(st) + 0.015, p.zAt(st), Math.atan2(p.top(b.cowlT) - p.top(0.05), p.L * (b.cowlT - 0.05)) * 0.8);
      (v.hood === 2 ? detail : paintParts).push(placed);
      const opening = new BoxGeometry(sw * 0.85, 0.045, 0.02);
      detail.push(place(solid(opening, CELL.soot), 0, p.top(st) + 0.02, p.zAt(st) - 0.25));
    }
    if (v.hood === 2) {
      // carbon hood panel overlay
      const t0 = 0.06, t1 = b.cowlT - 0.01;
      const len = (t1 - t0) * p.L;
      const g = new BoxGeometry(p.halfWidth((t0 + t1) / 2) * 1.5, 0.006, len);
      detail.push(place(cellUV(g.toNonIndexed(), CELL.carbon, true), 0, p.top((t0 + t1) / 2) + 0.012, p.zAt((t0 + t1) / 2), Math.atan2(p.top(t1) - p.top(t0), len)));
    }

    // --- wing / spoiler ---
    const wingLv = this.opts.wingLevel > 0 ? this.opts.wingLevel : b.stockWing;
    if (wingLv > 0 && b.kind !== 'bus' && b.kind !== 'truck' && b.kind !== 'van') {
      const wt = b.kind === 'pickup' ? 0.6 : b.kind === 'hatch' || b.kind === 'suv' || b.kind === 'offroad' ? b.roofT1 : Math.min(0.975, b.deckT + (1 - b.deckT) * 0.6);
      const wy = p.top(wt);
      const wz = p.zAt(wt);
      const ww = p.halfWidth(wt) * 2 * (wingLv === 3 ? 1.0 : 0.92);
      if (wingLv === 1) {
        const lip = new BoxGeometry(ww, 0.025, 0.12);
        paintParts.push(place(paintUV(lip), 0, wy + 0.01, wz + 0.02, 0.25));
      } else {
        const h = wingLv === 3 ? 0.32 : 0.14;
        const chord = wingLv === 3 ? 0.3 : 0.2;
        const blade = new BoxGeometry(ww, 0.025, chord);
        const bg = wingLv === 3 ? cellUV(blade.toNonIndexed(), CELL.carbon, true) : paintUV(blade);
        (wingLv === 3 ? detail : paintParts).push(place(bg, 0, wy + h, wz + 0.03, -0.12));
        for (const sx of [-1, 1]) {
          const strut = new BoxGeometry(0.02, h, 0.08);
          detail.push(place(solid(strut, CELL.gloss), sx * ww * 0.3, wy + h / 2, wz));
          if (wingLv === 3) {
            const ep = new BoxGeometry(0.012, 0.14, chord + 0.08);
            detail.push(place(cellUV(ep.toNonIndexed(), CELL.carbon, true), sx * ww * 0.5, wy + h, wz + 0.03));
          }
        }
      }
    }

    // --- utility extras ---
    if (b.roofRack) {
      for (const sx of [-1, 1]) {
        const rail = new BoxGeometry(0.04, 0.04, (b.roofT1 - b.roofT0) * p.L * 0.9);
        detail.push(place(solid(rail, CELL.alu), sx * p.halfWidth((b.roofT0 + b.roofT1) / 2) * b.roofW * 0.85, b.roofH + 0.05, p.zAt((b.roofT0 + b.roofT1) / 2)));
      }
    }
    if (b.spare) {
      const sp = new CylinderGeometry(b.wheelRadius * 0.95, b.wheelRadius * 0.95, 0.24, 18).rotateX(Math.PI / 2);
      detail.push(place(solid(sp, CELL.rubber), 0, (ry0 + ry1) / 2 + 0.05, tailZ + 0.14));
    }
    if (b.kind === 'pickup' && b.bedT) {
      // bed walls + floor
      const t0 = b.bedT, t1 = 0.995;
      const len = (t1 - t0) * p.L;
      const floor = new BoxGeometry(p.halfWidth(0.8) * 1.85, 0.02, len);
      detail.push(place(solid(floor, CELL.plastic), 0, b.deckH - 0.02, p.zAt((t0 + t1) / 2)));
    }

    // --- interior ---
    if (this.opts.interior && b.kind !== 'bus' && b.kind !== 'truck') {
      const cz = p.zAt(b.cowlT) + 0.42;
      const dashW = p.halfWidth(b.cowlT) * 1.7;
      const dash = new BoxGeometry(dashW, 0.16, 0.4);
      detail.push(place(solid(dash, CELL.interior), 0, Math.min(b.beltH, p.top(b.cowlT)) - 0.1, cz));
      const gauge = new BoxGeometry(0.34, 0.12, 0.02);
      detail.push(place(cellUV(gauge.toNonIndexed(), CELL.gauges, true), -b.trackF * 0.22, Math.min(b.beltH, p.top(b.cowlT)) + 0.0, cz + 0.12, -0.4));
      for (const sx of [-1, 1]) {
        const seat = new BoxGeometry(0.46, 0.12, 0.5);
        detail.push(place(solid(seat, CELL.leather), sx * b.trackF * 0.22, b.clearance + 0.22, cz + 0.85));
        const back = new BoxGeometry(0.46, 0.62, 0.12);
        detail.push(place(solid(back, CELL.leather), sx * b.trackF * 0.22, b.clearance + 0.55, cz + 1.12, -0.18));
      }
      const tunnel = new BoxGeometry(0.22, 0.2, 0.9);
      detail.push(place(solid(tunnel, CELL.interior), 0, b.clearance + 0.22, cz + 0.6));
      // steering wheel (separate group so it can turn)
      const sw = new Group();
      const rimG = new TorusGeometry(0.17, 0.018, 8, 24);
      const hub = new CylinderGeometry(0.05, 0.05, 0.04, 12).rotateX(Math.PI / 2);
      const spokeG = new BoxGeometry(0.3, 0.025, 0.02);
      const swGeo = mergeParts([solid(rimG, CELL.interior), solid(hub, CELL.gloss), solid(spokeG, CELL.alu)]);
      const swMesh = new Mesh(swGeo, this.mats.detail);
      sw.add(swMesh);
      sw.position.set(-b.trackF * 0.22, b.beltH + 0.02, cz + 0.32);
      sw.rotation.x = -0.35;
      this.bodyGroup.add(sw);
      this.steeringWheel = swMesh;
    }

    if (detail.length) {
      const m = new Mesh(mergeParts(detail), this.mats.detail);
      m.castShadow = true;
      this.add(m);
    }
    if (paintParts.length) {
      const m = new Mesh(mergeParts(paintParts), this.mats.paint);
      m.castShadow = true;
      this.add(m);
    }
    if (head.length) this.add(new Mesh(mergeParts(head), this.mats.head));
    if (tail.length) this.add(new Mesh(mergeParts(tail), this.mats.tail));
    const pp = this.parts!;
    const extra: [BufferGeometry[], Material][] = [[pp.drl, this.mats.drl], [pp.indL, this.mats.indL], [pp.indR, this.mats.indR], [pp.rev, this.mats.reverse], [pp.grille, this.mats.grille], [pp.plate, this.mats.plate], [pp.trim, this.mats.trim]];
    for (const [arr, mat] of extra) {
      if (!arr.length) continue;
      const m = new Mesh(mergeParts(arr), mat);
      m.castShadow = mat === this.mats.trim;
      this.add(m);
    }

    // underglow
    const ug = new Mesh(
      new PlaneGeometry(b.width * 1.2, b.length * 1.05).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: v.underglow || 0x00aaff, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, map: glowTexture() }),
    );
    ug.position.y = 0.03;
    ug.visible = v.underglow !== 0;
    ug.renderOrder = 2;
    this.underglow = ug;
    this.bodyGroup.add(ug);
  }

  private buildWheels() {
    const b = this.body;
    const v = this.visual;
    const p = this.profile;
    const offroad = b.kind === 'offroad';
    for (let i = 0; i < 4; i++) {
      const front = i < 2, left = i % 2 === 0;
      const tw = front ? b.tireWidthF : b.tireWidthR;
      const wg = buildWheel(b.wheelRadius, tw, v.rimStyle, v.rimSize, offroad, this.opts.quality);
      const root = new Group();
      const spinner = new Group();
      const tire = new Mesh(wg.tire, this.mats.detail);
      const rim = new Mesh(wg.rim, this.mats.rim);
      const disc = new Mesh(wg.disc, this.mats.detail);
      tire.castShadow = true;
      spinner.add(tire, rim, disc);
      const cal = new Mesh(wg.caliper, this.mats.caliper);
      root.add(spinner, cal);
      if (left) root.scale.x = -1;
      // default rest position (overwritten by physics)
      root.position.set((left ? -1 : 1) * (front ? b.trackF : b.trackR) / 2, b.wheelRadius, front ? p.axleF : p.axleR);
      this.bodyGroup.add(root);
      this.wheels.push({ root, spinner, front, left });
    }
  }

  /** Update visuals from physics wheel state (positions given in physics body space). */
  setWheel(i: number, bodyX: number, bodyY: number, bodyZ: number, steer: number, spin: number) {
    const w = this.wheels[i];
    // convert physics body space -> bodyGroup space
    const o = this.bodyGroup.position;
    w.root.position.set(bodyX - o.x, bodyY - o.y, bodyZ - o.z);
    w.root.rotation.y = -steer;
    w.spinner.rotation.x = -spin;
  }

  setLights(headOn: boolean, brake: number, night: number, reverse = false) {
    this.mats.head.emissiveIntensity = headOn ? 2.6 + night * 2.4 : 0;
    this.mats.tail.emissiveIntensity = (headOn ? 1.1 : 0.3) + brake * 3.4;
    this.mats.drl.emissiveIntensity = 1.4 + night * 0.8;
    this.mats.reverse.emissiveIntensity = reverse ? 2.6 : 0;
  }

  /** Turn indicators (already blinking: pass the lamp state of this instant). */
  setIndicators(left: boolean, right: boolean) {
    this.mats.indL.emissiveIntensity = left ? 3.2 : 0;
    this.mats.indR.emissiveIntensity = right ? 3.2 : 0;
  }

  setSteeringWheel(angle: number) {
    if (this.steeringWheel) this.steeringWheel.rotation.z = -angle * 6;
  }

  updateVisual(v: VisualConfig) {
    this.visual = v;
    updateLivery(this.mats, this.body, v, this.opts.quality >= 2);
    if (this.underglow) {
      this.underglow.visible = v.underglow !== 0;
      (this.underglow.material as MeshBasicMaterial).color.setHex(v.underglow || 0x00aaff);
    }
  }

  setEnvMap(env: any) {
    for (const m of [this.mats.paint, this.mats.glass, this.mats.rim, this.mats.detail, this.mats.head]) {
      (m as any).envMap = env;
      m.needsUpdate = true;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
    });
    this.mats.dispose();
  }
}

let _glow: CanvasTexture | null = null;
export function glowTexture(): CanvasTexture {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _glow = new CanvasTexture(c);
  return _glow;
}
