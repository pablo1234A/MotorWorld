import {
  BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, Shape, SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';
import type { BodyProfile } from './BodyGeometry';
import type { BodyStyle } from './BodyStyle';
import { CELL, cellUV } from './CarMaterials';
import { mergeParts } from './WheelBuilder';

const solid = (g: BufferGeometry, cell: number) => cellUV(g.index ? g.toNonIndexed() : g, cell);
function at(g: BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

export interface InteriorResult {
  group: Group;
  steering: Group;
  gearLever: Group;
  eye: Vector3;
  cluster: Cluster | null;
}

/**
 * Live instrument cluster drawn on a canvas (tachometer, speed, gear, indicators) shown in the cockpit view.
 */
export class Cluster {
  readonly texture: CanvasTexture;
  private g: CanvasRenderingContext2D;
  private last = '';
  constructor() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 200;
    this.g = c.getContext('2d')!;
    this.texture = new CanvasTexture(c);
    this.texture.colorSpace = SRGBColorSpace;
    this.draw(900, 7000, 0, 0, 0, false, 'A');
  }

  draw(rpm: number, redline: number, kmh: number, gear: number, ind: number, blink: boolean, mode: string) {
    const key = `${Math.round(rpm / 50)}|${Math.round(kmh)}|${gear}|${ind}|${blink}|${mode}`;
    if (key === this.last) return;
    this.last = key;
    const g = this.g, W = 512, H = 200;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#07080a');
    bg.addColorStop(1, '#101216');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // tachometer arc
    const cx = 150, cy = 118, r = 86;
    const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    const max = Math.ceil((redline + 1000) / 1000) * 1000;
    g.lineWidth = 3;
    g.strokeStyle = '#2b3038';
    g.beginPath();
    g.arc(cx, cy, r, a0, a1);
    g.stroke();
    g.strokeStyle = '#e01a2b';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, r, a0 + (a1 - a0) * (redline / max), a1);
    g.stroke();
    g.fillStyle = '#c9ced6';
    g.font = 'bold 15px Rajdhani, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let k = 0; k <= max / 1000; k++) {
      const a = a0 + (a1 - a0) * ((k * 1000) / max);
      g.strokeStyle = '#8b929c';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
      g.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
      g.stroke();
      g.fillText(String(k), cx + Math.cos(a) * (r - 24), cy + Math.sin(a) * (r - 24));
    }
    // needle
    const an = a0 + (a1 - a0) * Math.min(1.02, rpm / max);
    g.strokeStyle = '#ff3446';
    g.lineWidth = 4;
    g.shadowColor = '#ff3446';
    g.shadowBlur = 8;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(an) * (r - 6), cy + Math.sin(an) * (r - 6));
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = '#1c2026';
    g.beginPath();
    g.arc(cx, cy, 14, 0, Math.PI * 2);
    g.fill();
    // gear
    g.fillStyle = rpm > redline * 0.93 ? '#ff3446' : '#ffffff';
    g.font = 'bold 44px Rajdhani, sans-serif';
    g.fillText(gear < 0 ? 'R' : gear === 0 ? 'N' : String(gear), cx, cy + 46);
    g.fillStyle = '#7d8590';
    g.font = '12px "JetBrains Mono", monospace';
    g.fillText(mode, cx + 40, cy + 62);
    // speed
    g.fillStyle = '#ffffff';
    g.font = 'bold 76px Rajdhani, sans-serif';
    g.textAlign = 'right';
    g.fillText(String(Math.round(kmh)), 440, 104);
    g.fillStyle = '#7d8590';
    g.font = '14px "JetBrains Mono", monospace';
    g.fillText('KM/H', 440, 146);
    // indicators
    const arrow = (x: number, dir: number, on: boolean) => {
      g.fillStyle = on ? '#39e07a' : '#1d3a28';
      g.beginPath();
      g.moveTo(x + dir * 16, 24);
      g.lineTo(x, 12);
      g.lineTo(x, 36);
      g.closePath();
      g.fill();
    };
    arrow(300, -1, blink && (ind === -1 || ind === 2));
    arrow(470, 1, blink && (ind === 1 || ind === 2));
    this.texture.needsUpdate = true;
  }
}

/** Static center screen (navigation look). */
let navTex: CanvasTexture | null = null;
function navTexture() {
  if (navTex) return navTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = '#2d3440';
  g.lineWidth = 10;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(0, 20 + i * 28);
    g.lineTo(256, 10 + i * 30);
    g.stroke();
  }
  g.strokeStyle = '#2f6feb';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(128, 160);
  g.lineTo(128, 90);
  g.lineTo(200, 40);
  g.stroke();
  g.fillStyle = '#e01a2b';
  g.beginPath();
  g.moveTo(128, 120);
  g.lineTo(118, 140);
  g.lineTo(138, 140);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.font = 'bold 13px sans-serif';
  g.fillText('MOTORWORLD NAV', 10, 18);
  navTex = new CanvasTexture(c);
  navTex.colorSpace = SRGBColorSpace;
  return navTex;
}

/**
 * Cabin: inner skin (door cards, pillars, headliner — the body seen from inside), dashboard with gauge
 * binnacle and live cluster, centre screen, steering wheel, seats, console with gear lever, mirror.
 */
export function buildInterior(p: BodyProfile, b: BodyStyle, bodyGeo: BufferGeometry, detailMat: MeshStandardMaterial, live: boolean): InteriorResult {
  const group = new Group();
  const parts: BufferGeometry[] = [];
  const xd = -b.trackF * 0.22; // driver on the left
  const cz = p.zAt(b.cowlT);
  const zEye = p.zAt(b.roofT0) + 0.4;
  const yEye = Math.min(b.beltH + 0.25, b.roofH - 0.11);
  const eye = new Vector3(xd, yEye, zEye);
  const yDash = Math.min(b.hoodH, b.beltH - 0.04, yEye - 0.3);
  const zDashRear = zEye - 0.52;
  const wIn = p.halfWidth(b.cowlT + 0.05, false) * 0.9;

  // --- inner skin: the cabin part of the body, flipped inwards
  {
    const pos = bodyGeo.getAttribute('position'), nor = bodyGeo.getAttribute('normal');
    const idx = bodyGeo.index!;
    const out: number[] = [];
    const z0 = cz - 0.1, z1 = p.zAt(Math.min(0.97, b.deckT + 0.02));
    const groups = bodyGeo.groups.filter((gr) => gr.materialIndex !== 1); // everything but glass
    for (const gr of groups)
      for (let i = gr.start; i < gr.start + gr.count; i += 3) {
        const a = idx.getX(i), c = idx.getX(i + 1), d = idx.getX(i + 2);
        const zc = (pos.getZ(a) + pos.getZ(c) + pos.getZ(d)) / 3, yc = (pos.getY(a) + pos.getY(c) + pos.getY(d)) / 3;
        if (zc < z0 || zc > z1 || yc < b.clearance + 0.2) continue;
        for (const k of [a, d, c]) {
          const o = 0.025;
          out.push(pos.getX(k) - nor.getX(k) * o, pos.getY(k) - nor.getY(k) * o, pos.getZ(k) - nor.getZ(k) * o);
        }
      }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(out, 3));
    g.computeVertexNormals();
    g.setAttribute('uv', new Float32BufferAttribute(new Float32Array((out.length / 3) * 2), 2));
    parts.push(cellUV(g, CELL.interior));
  }
  // --- floor
  parts.push(solid(at(new PlaneGeometry(wIn * 2, p.zAt(b.roofT1) - cz).rotateX(-Math.PI / 2), 0, b.clearance + 0.13, (cz + p.zAt(b.roofT1)) / 2), CELL.rubber));
  // --- dashboard: a side profile extruded across the cabin
  {
    const s = new Shape();
    s.moveTo(cz - 0.08, yDash);
    s.lineTo(zDashRear - 0.08, yDash - 0.01);
    s.quadraticCurveTo(zDashRear + 0.02, yDash - 0.02, zDashRear + 0.02, yDash - 0.1);
    s.lineTo(zDashRear + 0.05, yDash - 0.3);
    s.lineTo(zDashRear - 0.1, yDash - 0.46);
    s.lineTo(cz - 0.08, yDash - 0.46);
    s.closePath();
    const dash = new ExtrudeGeometry(s, { depth: wIn * 2, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 6 });
    // shape is in (x = car z, y = y); rotateY(-90deg) maps shape x -> z and the extrusion (+z) -> -x
    dash.rotateY(-Math.PI / 2);
    dash.translate(wIn, 0, 0);
    parts.push(solid(dash, CELL.interior));
    // soft-touch upper pad and a strip of trim
    parts.push(solid(at(new BoxGeometry(wIn * 2, 0.012, 0.03), 0, yDash - 0.13, zDashRear + 0.03), CELL.alu));
  }
  // gauge binnacle
  const bin = new CylinderGeometry(0.12, 0.12, 0.12, 18, 1, true, -Math.PI / 2, Math.PI);
  parts.push(solid(at(bin, xd, yDash - 0.06, zDashRear + 0.0, 0, 0, Math.PI / 2), CELL.interior));
  // centre console + tunnel
  parts.push(solid(at(new BoxGeometry(0.26, 0.24, zEye - zDashRear + 0.2), 0, b.clearance + 0.28, (zDashRear + zEye) / 2 + 0.1), CELL.interior));
  parts.push(solid(at(new BoxGeometry(0.24, 0.3, 0.18), 0, yDash - 0.28, zDashRear + 0.06), CELL.gloss));
  // seats
  const seat = (x: number) => {
    const zs = zEye + 0.12;
    const yb = Math.max(b.clearance + 0.22, yEye - 0.72);
    parts.push(solid(at(new BoxGeometry(0.46, 0.11, 0.5), x, yb, zs - 0.12), CELL.leather));
    for (const sx of [-1, 1]) parts.push(solid(at(new BoxGeometry(0.07, 0.16, 0.48), x + sx * 0.22, yb + 0.05, zs - 0.12), CELL.leather));
    parts.push(solid(at(new BoxGeometry(0.46, 0.62, 0.11), x, yb + 0.36, zs + 0.18, -0.2), CELL.leather));
    for (const sx of [-1, 1]) parts.push(solid(at(new BoxGeometry(0.07, 0.5, 0.16), x + sx * 0.22, yb + 0.34, zs + 0.15, -0.2), CELL.leather));
    parts.push(solid(at(new BoxGeometry(0.26, 0.2, 0.1), x, yb + 0.76, zs + 0.27, -0.12), CELL.leather));
  };
  seat(xd);
  seat(-xd);
  if (b.kind === 'sedan' || b.kind === 'hatch' || b.kind === 'suv' || b.kind === 'offroad' || b.kind === 'classic' || b.kind === 'muscle') {
    const zr = Math.min(p.zAt(b.roofT1) - 0.2, zEye + 0.85);
    parts.push(solid(at(new BoxGeometry(wIn * 1.7, 0.14, 0.48), 0, b.clearance + 0.3, zr), CELL.leather));
    parts.push(solid(at(new BoxGeometry(wIn * 1.7, 0.55, 0.12), 0, b.clearance + 0.62, zr + 0.26, -0.15), CELL.leather));
  }
  // interior mirror
  parts.push(solid(at(new BoxGeometry(0.24, 0.07, 0.03), 0, b.roofH - 0.1, p.zAt(b.roofT0) + 0.08), CELL.gloss));
  parts.push(solid(at(new BoxGeometry(0.22, 0.055, 0.005), 0, b.roofH - 0.1, p.zAt(b.roofT0) + 0.097), CELL.chrome));
  const mergedMesh = new Mesh(mergeParts(parts), detailMat);
  mergedMesh.receiveShadow = true;
  group.add(mergedMesh);

  // live cluster & centre screen
  let cluster: Cluster | null = null;
  if (live) cluster = new Cluster();
  const clusterMat = new MeshBasicMaterial({ map: cluster ? cluster.texture : navTexture(), toneMapped: false });
  const cl = new Mesh(new PlaneGeometry(0.28, 0.11), clusterMat);
  cl.position.set(xd, yDash - 0.075, zDashRear + 0.035);
  cl.rotation.x = -0.25;
  group.add(cl);
  const nav = new Mesh(new PlaneGeometry(0.2, 0.125), new MeshBasicMaterial({ map: navTexture(), toneMapped: false, side: DoubleSide }));
  nav.position.set(0, yDash - 0.17, zDashRear + 0.155);
  nav.rotation.x = -0.15;
  group.add(nav);

  // steering wheel (turns with the steering)
  const steering = new Group();
  const rim = new TorusGeometry(0.175, 0.02, 10, 32);
  const hub = new CylinderGeometry(0.055, 0.06, 0.05, 16).rotateX(Math.PI / 2);
  const spokeL = new BoxGeometry(0.13, 0.03, 0.022).translate(-0.09, -0.01, 0);
  const spokeR = new BoxGeometry(0.13, 0.03, 0.022).translate(0.09, -0.01, 0);
  const spokeD = new BoxGeometry(0.03, 0.12, 0.022).translate(0, -0.1, 0);
  const badge = new CylinderGeometry(0.02, 0.02, 0.006, 14).rotateX(Math.PI / 2).translate(0, 0, -0.028);
  const swGeo = mergeParts([solid(rim, CELL.leather), solid(hub, CELL.interior), solid(spokeL, CELL.alu), solid(spokeR, CELL.alu), solid(spokeD, CELL.alu), solid(badge, CELL.chrome)]);
  const swMesh = new Mesh(swGeo, detailMat);
  steering.add(swMesh);
  steering.position.set(xd, yEye - 0.33, zEye - 0.52);
  steering.rotation.x = -0.38;
  const column = new Mesh(solid(new CylinderGeometry(0.03, 0.04, 0.32, 10).rotateX(Math.PI / 2 - 0.38).translate(xd, yEye - 0.38, zEye - 0.66), CELL.interior), detailMat);
  group.add(steering, column);

  // gear lever
  const gearLever = new Group();
  const lever = mergeParts([solid(new CylinderGeometry(0.01, 0.012, 0.16, 8).translate(0, 0.08, 0), CELL.alu), solid(new CylinderGeometry(0.025, 0.02, 0.05, 12).translate(0, 0.17, 0), CELL.leather)]);
  gearLever.add(new Mesh(lever, detailMat));
  gearLever.position.set(0, b.clearance + 0.4, zEye - 0.12);
  group.add(gearLever);
  return { group, steering, gearLever, eye, cluster };
}
