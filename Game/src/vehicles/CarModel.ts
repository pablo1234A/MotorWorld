import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, Euler, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, TorusGeometry, Vector3,
} from 'three';
import type { BodyStyle } from './BodyStyle';
import { BodyProfile, buildBodyGeometry } from './BodyGeometry';
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
  underglow: Mesh | null = null;
  private meshes: Mesh[] = [];
  /** Driver eye position in body-offset space. */
  readonly eye = new Vector3();
  readonly hoodCam = new Vector3();

  constructor(public readonly body: BodyStyle, public visual: VisualConfig, public opts: CarModelOptions) {
    const physical = opts.quality >= 2;
    this.mats = createCarMaterials(body, visual, physical, opts.quality >= 2 ? 1024 : 512);
    this.root.add(this.bodyGroup);
    const { geometry, profile } = buildBodyGeometry(body);
    this.profile = profile;
    const bodyMesh = new Mesh(geometry, [this.mats.paint, this.mats.glass]);
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

    // --- front fascia ---
    const fy0 = p.bottom(0, false), fy1 = p.top(0);
    const fw = p.halfWidth(0);
    const fh = fy1 - fy0;
    const grilleW = { wide: 0.62, split: 0.24, mesh: 0.55, small: 0.3, none: 0, chrome: 0.5, tall: 0.6 }[b.grille];
    if (grilleW > 0) {
      const gh = b.grille === 'tall' ? fh * 0.5 : b.grille === 'small' ? fh * 0.22 : fh * 0.32;
      const gy = fy0 + fh * (b.grille === 'tall' ? 0.5 : 0.48);
      if (b.grille === 'split') {
        for (const sx of [-1, 1]) {
          const g = new BoxGeometry(fw * grilleW, gh * 1.3, 0.02);
          detail.push(place(cellUV(g.toNonIndexed(), CELL.grille, true), sx * fw * 0.16, gy, noseZ - 0.004));
          const fr = new BoxGeometry(fw * grilleW + 0.02, gh * 1.3 + 0.02, 0.012);
          detail.push(place(solid(fr, CELL.chrome), sx * fw * 0.16, gy, noseZ + 0.002));
        }
      } else {
        const g = new BoxGeometry(fw * 2 * grilleW, gh, 0.02);
        detail.push(place(cellUV(g.toNonIndexed(), CELL.grille, true), 0, gy, noseZ - 0.004));
        if (b.grille === 'chrome' || b.grille === 'tall') {
          const fr = new BoxGeometry(fw * 2 * grilleW + 0.03, gh + 0.03, 0.012);
          detail.push(place(solid(fr, CELL.chrome), 0, gy, noseZ + 0.003));
          for (let i = -3; i <= 3; i++) {
            const bar = new BoxGeometry(0.012, gh, 0.02);
            detail.push(place(solid(bar, CELL.chrome), (i / 3.5) * fw * grilleW, gy, noseZ - 0.008));
          }
        }
      }
    }
    // lower intake
    const intakeW = v.frontBumper === 2 ? 0.86 : v.frontBumper === 1 ? 0.78 : 0.6;
    {
      const g = new BoxGeometry(fw * 2 * intakeW, fh * 0.22, 0.02);
      detail.push(place(cellUV(g.toNonIndexed(), CELL.grille, true), 0, fy0 + fh * 0.16, noseZ - 0.004));
    }
    if (v.frontBumper >= 1) {
      // side vents / canards
      for (const sx of [-1, 1]) {
        const g = new BoxGeometry(fw * 0.22, fh * 0.3, 0.02);
        detail.push(place(solid(g, CELL.gloss), sx * fw * 0.78, fy0 + fh * 0.3, noseZ - 0.005));
        if (v.frontBumper === 2) {
          const c = new BoxGeometry(0.14, 0.012, 0.12);
          detail.push(place(solid(c, CELL.carbon), sx * (fw + 0.02), fy0 + fh * 0.42, noseZ + 0.08, 0, 0, sx * 0.25));
        }
      }
    }
    // splitter
    if (this.opts.splitterLevel > 0 || v.frontBumper === 2) {
      const ext = 0.04 + 0.03 * this.opts.splitterLevel;
      const g = new BoxGeometry(fw * 2 * 0.98, 0.018, ext + 0.15);
      detail.push(place(cellUV(g.toNonIndexed(), CELL.carbon, true), 0, b.clearance + 0.03, noseZ + 0.06 - ext));
    }
    // front plate
    if (b.kind !== 'hyper' && b.kind !== 'mid') {
      const g = new BoxGeometry(0.42, 0.1, 0.01);
      detail.push(place(cellUV(g.toNonIndexed(), CELL.plate, true), 0, fy0 + fh * 0.32, noseZ - 0.012));
    }

    // --- headlights ---
    const hlT = b.kind === 'bus' || b.kind === 'truck' || b.kind === 'van' ? 0.002 : 0.035;
    const hz = p.zAt(hlT);
    const hY = p.top(hlT) - (b.kind === 'bus' || b.kind === 'truck' ? 0.7 : 0.08);
    const hX = p.halfWidth(hlT) * 0.68;
    const slope = Math.atan2(p.top(0.06) - p.top(0.01), p.L * 0.05);
    const addHead = (g: BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0) => {
      const ng = g.index ? g.toNonIndexed() : g;
      place(ng, x, y, z, rx, ry);
      head.push(ng, mirrored(ng));
      this.headPos.push(new Vector3(x, y, z - 0.05), new Vector3(-x, y, z - 0.05));
    };
    switch (b.headlight) {
      case 'round': {
        const r = b.kind === 'offroad' ? 0.11 : 0.085;
        const g = new CylinderGeometry(r, r, 0.08, 18);
        addHead(g, hX, hY - 0.02, hz - 0.02, Math.PI / 2 - slope * 0.5, 0);
        const ring = new TorusGeometry(r, 0.012, 6, 18);
        detail.push(place(solid(ring, CELL.chrome), hX, hY - 0.02, hz - 0.05));
        detail.push(place(solid(ring.clone(), CELL.chrome), -hX, hY - 0.02, hz - 0.05));
        break;
      }
      case 'quad': {
        for (const dx of [-0.07, 0.09]) addHead(new CylinderGeometry(0.06, 0.06, 0.06, 14), hX + dx, hY - 0.04, noseZ + 0.01, Math.PI / 2, 0);
        break;
      }
      case 'square': {
        addHead(new BoxGeometry(0.26, 0.16, 0.06), hX, hY, noseZ + 0.01);
        break;
      }
      case 'wide':
      case 'slim':
      case 'led':
      default: {
        const w = b.headlight === 'wide' ? 0.36 : b.headlight === 'slim' ? 0.42 : 0.38;
        const h = b.headlight === 'slim' ? 0.045 : b.headlight === 'led' ? 0.06 : 0.11;
        const g = new BoxGeometry(w, h, 0.22);
        addHead(g, hX - 0.02, hY, hz, -slope * 0.9, 0.12);
        if (b.headlight === 'led') {
          const drl = new BoxGeometry(0.3, 0.012, 0.02);
          const ng = place(drl.toNonIndexed(), hX - 0.02, hY - 0.06, hz - 0.08, 0, 0.12);
          head.push(ng, mirrored(ng));
        }
      }
    }
    if (b.lightBar) {
      const lb = new BoxGeometry(1.1, 0.08, 0.22);
      detail.push(place(solid(lb, CELL.gloss), 0, b.roofH + 0.05, p.zAt((b.roofT0 + b.roofT1) / 2)));
      for (const sx of [-1, 1]) {
        const lens = new BoxGeometry(0.45, 0.07, 0.2);
        const ng = place(lens.toNonIndexed(), sx * 0.26, b.roofH + 0.06, p.zAt((b.roofT0 + b.roofT1) / 2));
        (sx < 0 ? tail : head).push(ng);
      }
    }

    // --- rear ---
    const ry0 = p.bottom(1, false), ry1 = p.top(1);
    const rw = p.halfWidth(1);
    const rh = ry1 - ry0;
    const tY = ry0 + rh * (b.kind === 'truck' || b.kind === 'bus' || b.kind === 'van' ? 0.25 : 0.72);
    const addTail = (g: BufferGeometry, x: number, y: number, z: number, mirror = true) => {
      const ng = g.index ? g.toNonIndexed() : g;
      place(ng, x, y, z);
      tail.push(ng);
      if (mirror) tail.push(mirrored(ng));
      this.tailPos.push(new Vector3(x, y, z + 0.03));
      if (mirror) this.tailPos.push(new Vector3(-x, y, z + 0.03));
    };
    switch (b.taillight) {
      case 'bar':
        addTail(new BoxGeometry(rw * 1.8, 0.05, 0.03), 0, tY, tailZ + 0.006, false);
        addTail(new BoxGeometry(0.2, 0.08, 0.03), rw * 0.72, tY - 0.02, tailZ + 0.008);
        break;
      case 'round':
        for (const dx of [0, -0.17]) addTail(new CylinderGeometry(0.065, 0.065, 0.04, 16).rotateX(Math.PI / 2), rw * 0.72 + dx, tY, tailZ + 0.006);
        break;
      case 'split':
        addTail(new BoxGeometry(0.34, 0.1, 0.03), rw * 0.68, tY, tailZ + 0.006);
        addTail(new BoxGeometry(0.08, 0.2, 0.03), rw * 0.86, tY - 0.08, tailZ + 0.006);
        break;
      case 'vertical':
        addTail(new BoxGeometry(0.12, 0.34, 0.04), rw * 0.86, tY, tailZ + 0.006);
        break;
      case 'wide':
      default:
        addTail(new BoxGeometry(0.46, 0.08, 0.03), rw * 0.62, tY, tailZ + 0.006);
        addTail(new BoxGeometry(rw * 0.7, 0.02, 0.03), 0, tY, tailZ + 0.006, false);
    }
    // rear plate + lower diffuser area
    {
      const g = new BoxGeometry(0.42, 0.1, 0.01);
      detail.push(place(cellUV(g.toNonIndexed(), CELL.plate, true), 0, ry0 + rh * 0.38, tailZ + 0.012));
      const low = new BoxGeometry(rw * 1.7, rh * 0.18, 0.03);
      detail.push(place(solid(low, CELL.plastic), 0, ry0 + rh * 0.1, tailZ + 0.004));
    }
    const diffLv = Math.max(this.opts.diffuserLevel, v.rearBumper);
    if (diffLv > 0) {
      const fins = 3 + diffLv;
      for (let i = 0; i < fins; i++) {
        const x = ((i / (fins - 1)) * 2 - 1) * rw * 0.6;
        const fin = new BoxGeometry(0.012, 0.1 + 0.03 * diffLv, 0.3);
        detail.push(place(solid(fin, CELL.carbon), x, b.clearance + 0.06, tailZ - 0.1));
      }
      const plate = new BoxGeometry(rw * 1.5, 0.012, 0.32);
      detail.push(place(cellUV(plate.toNonIndexed(), CELL.carbon, true), 0, b.clearance + 0.02, tailZ - 0.1, -0.15));
    }
    // exhausts
    const ex = b.exhaust;
    const exY = p.bottom(0.985, false) + 0.06;
    const exXs: number[] = [];
    if (ex.style === 'center') {
      for (let i = 0; i < ex.count; i++) exXs.push((i - (ex.count - 1) / 2) * ex.spread);
    } else if (ex.count === 1) exXs.push(rw * 0.55);
    else if (ex.count === 2) exXs.push(-rw * ex.spread, rw * ex.spread);
    else for (const s of [-1, 1]) exXs.push(s * rw * ex.spread, s * (rw * ex.spread - 0.11));
    for (const x of exXs) {
      const r = ex.style === 'square' ? 0.05 : b.kind === 'hyper' || b.kind === 'mid' ? 0.055 : 0.042;
      const tip = ex.style === 'square' ? new BoxGeometry(r * 2.4, r * 1.4, 0.16) : new CylinderGeometry(r, r, 0.16, 14, 1, true).rotateX(Math.PI / 2);
      detail.push(place(solid(tip, ex.style === 'square' ? CELL.alu : CELL.chrome), x, exY, tailZ - 0.02));
      const inner = new CircleGeometry(r * 0.85, 12);
      detail.push(place(solid(inner, CELL.soot), x, exY, tailZ + 0.055));
    }

    // --- sides: mirrors, trim, handles, intakes, skirts ---
    if (b.kind !== 'bus') {
      const mt = b.cowlT + 0.03;
      const mx = p.halfWidth(mt) + 0.08;
      const my = b.beltH + 0.07;
      const mirror = new BoxGeometry(0.16, 0.09, 0.07);
      const mg = place(paintUV(mirror), mx, my, p.zAt(mt));
      both(paintParts, mg);
      const glassM = new BoxGeometry(0.12, 0.07, 0.01);
      both(detail, place(solid(glassM, CELL.gloss), mx, my, p.zAt(mt) + 0.036));
      const arm = new BoxGeometry(0.1, 0.02, 0.03);
      both(paintParts, place(paintUV(arm), mx - 0.08, my - 0.03, p.zAt(mt)));
    }
    // beltline trim
    if (b.kind !== 'truck') {
      const t0 = b.cowlT + 0.01, t1 = Math.min(b.deckT, b.kind === 'pickup' ? b.roofT1 + 0.02 : b.deckT) - 0.01;
      const segs = 10;
      for (let i = 0; i < segs; i++) {
        const ta = t0 + ((t1 - t0) * i) / segs, tb = t0 + ((t1 - t0) * (i + 1)) / segs;
        if (p.green((ta + tb) / 2) < 0.5) continue;
        const xa = p.halfWidth(ta) + 0.004;
        const len = (tb - ta) * p.L;
        const g = new BoxGeometry(0.012, 0.018, len);
        both(detail, place(solid(g, b.chromeBumpers ? CELL.chrome : CELL.gloss), xa, Math.min(b.beltH, p.top((ta + tb) / 2) - 0.03), p.zAt((ta + tb) / 2)));
      }
    }
    // door handle
    if (b.kind !== 'bus' && b.kind !== 'truck') {
      const ht = Math.min(b.roofT1, b.roofT0 + (b.roofT1 - b.roofT0) * 0.8);
      const g = new BoxGeometry(0.02, 0.025, 0.14);
      both(detail, place(solid(g, b.chromeBumpers ? CELL.chrome : CELL.plastic), p.halfWidth(ht) + 0.01, b.beltH - 0.07, p.zAt(ht)));
    }
    if (b.sideIntake) {
      const it = Math.min(0.92, b.roofT1 + 0.06);
      const g = new BoxGeometry(0.03, 0.18, 0.42);
      both(detail, place(cellUV(g.toNonIndexed(), CELL.grille, true), p.halfWidth(it, false) + 0.0, (b.clearance + b.beltH) / 2 + 0.05, p.zAt(it)));
    }
    if (v.skirts > 0 || b.kind === 'hyper') {
      const t0 = p.tAt(p.axleF + p.archR + 0.02), t1 = p.tAt(p.axleR - p.archR - 0.02);
      const len = (t1 - t0) * p.L;
      const g = new BoxGeometry(0.06, 0.08, len);
      both(detail, place(cellUV(g.toNonIndexed(), CELL.carbon, true), p.halfWidth((t0 + t1) / 2, false) + 0.01, b.clearance + 0.04, p.zAt((t0 + t1) / 2)));
    }
    // chrome bumpers (classic)
    if (b.chromeBumpers) {
      const fb = new BoxGeometry(fw * 2.05, 0.07, 0.08);
      detail.push(place(solid(fb, CELL.chrome), 0, fy0 + fh * 0.3, noseZ - 0.02));
      const rb = new BoxGeometry(rw * 2.05, 0.07, 0.08);
      detail.push(place(solid(rb, CELL.chrome), 0, ry0 + rh * 0.3, tailZ + 0.02));
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

  setLights(headOn: boolean, brake: number, night: number) {
    this.mats.head.emissiveIntensity = headOn ? 2.4 + night * 2 : 0.25;
    this.mats.tail.emissiveIntensity = (headOn ? 0.9 : 0.25) + brake * 3.2;
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
