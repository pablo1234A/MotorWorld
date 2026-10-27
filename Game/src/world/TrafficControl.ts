import {
  BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Matrix4,
  MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, SRGBColorSpace, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2 } from '../core/Random';
import { CITY } from './WorldDef';
import type { Road, RoadNetwork } from './RoadNetwork';

export type Control = 'signal' | 'stop' | 'yield' | 'none';
export type LightState = 'green' | 'yellow' | 'red';

/** One way into an intersection: cars on `road` travelling in `dir` stop at arc length `s`. */
export interface Approach {
  inter: Intersection;
  road: Road;
  dir: 1 | -1;
  /** stop line (arc length on road) */
  s: number;
  control: Control;
  /** signal phase group (0 / 1) */
  group: 0 | 1;
  /** stop line centre, arriving heading */
  x: number;
  y: number;
  z: number;
  hx: number;
  hz: number;
}

export interface Intersection {
  id: number;
  x: number;
  y: number;
  z: number;
  approaches: Approach[];
  roads: Road[];
  signal: boolean;
  offset: number;
}

// signal plan (seconds): group 0 green, yellow, all red, group 1 green, yellow, all red
const G = 16, Y = 3, AR = 2;
const CYCLE = 2 * (G + Y + AR);

const _pt = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };

/**
 * Traffic control derived from the road network: signalised city crossings (two phase groups),
 * STOP / YIELD on minor approaches elsewhere, stop lines, zebra crossings, speed-limit and curve signs.
 * Traffic AI and pedestrians query it; it also renders the street furniture (instanced).
 */
export class TrafficControl {
  readonly intersections: Intersection[] = [];
  /** approaches per road, sorted by s */
  private byRoad = new Map<Road, Approach[]>();
  time = 0;
  readonly group = new Group();
  private lamps: { red: InstancedMesh; yellow: InstancedMesh; green: InstancedMesh } | null = null;
  private signalApproaches: Approach[] = [];
  private lampTimer = 0;

  constructor(private roads: RoadNetwork) {
    this.build();
  }

  // ------------------------------------------------------------------ topology
  private build() {
    const pts: { x: number; z: number; road: Road; s: number; end: boolean }[] = [];
    for (const r of this.roads.roads) {
      if (!r.info.traffic) continue;
      for (const j of r.junctions) {
        if (!j.road.info.traffic) continue;
        r.pointAt(j.s, _pt);
        pts.push({ x: _pt.x, z: _pt.z, road: r, s: j.s, end: j.end });
      }
    }
    // cluster junction points into intersections
    const used = new Array(pts.length).fill(false);
    for (let i = 0; i < pts.length; i++) {
      if (used[i]) continue;
      const members = [pts[i]];
      used[i] = true;
      for (let k = i + 1; k < pts.length; k++) {
        if (used[k]) continue;
        if (Math.hypot(pts[k].x - pts[i].x, pts[k].z - pts[i].z) < 16) {
          members.push(pts[k]);
          used[k] = true;
        }
      }
      const roadsHere = [...new Set(members.map((m) => m.road))];
      if (roadsHere.length < 2) continue;
      const cx = members.reduce((a, m) => a + m.x, 0) / members.length, cz = members.reduce((a, m) => a + m.z, 0) / members.length;
      roadsHere[0].pointAt(members[0].s, _pt);
      const inCity = cx > CITY.x0 - 30 && cx < CITY.x1 + 30 && cz > CITY.z0 - 30 && cz < CITY.z1 + 30;
      const cityRoads = roadsHere.every((r) => r.def.kind === 'street' || r.def.kind === 'boulevard');
      const inter: Intersection = { id: this.intersections.length, x: cx, y: _pt.y, z: cz, approaches: [], roads: roadsHere, signal: inCity && cityRoads, offset: hash2(Math.round(cx), Math.round(cz)) * CYCLE };
      // one entry per road (the member closest to the centre)
      for (const r of roadsHere) {
        const m = members.filter((q) => q.road === r).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
        const others = roadsHere.filter((o) => o !== r);
        const clear = Math.max(...others.map((o) => o.halfWidth)) + (inter.signal ? 4.2 : 2.5);
        const isEnd = !r.loop && (m.s < 12 || m.s > r.length - 12);
        const dirs: (1 | -1)[] = isEnd ? [m.s < 12 ? -1 : 1] : [1, -1];
        for (const dir of dirs) {
          const s = m.s - dir * clear;
          if (!r.loop && (s < 2 || s > r.length - 2)) continue;
          r.pointAt(s, _pt);
          inter.approaches.push({ inter, road: r, dir, s, control: 'none', group: 0, x: _pt.x, y: _pt.y, z: _pt.z, hx: _pt.tx * dir, hz: _pt.tz * dir });
        }
      }
      if (inter.approaches.length < 2) continue;
      // controls
      if (inter.signal) {
        const ref = inter.approaches[0];
        for (const a of inter.approaches) {
          a.control = 'signal';
          a.group = Math.abs(a.hx * ref.hx + a.hz * ref.hz) > 0.7 ? 0 : 1;
        }
      } else {
        // the most important road keeps priority; the others stop (or yield onto fast roads)
        const prio = (r: Road) => ({ highway: 0, boulevard: 1, road: 2, street: 3, mountain: 4, dirt: 5, circuit: 9, strip: 9 })[r.def.kind];
        const major = roadsHere.slice().sort((a, b) => prio(a) - prio(b))[0];
        for (const a of inter.approaches) {
          if (a.road === major) continue;
          a.control = major.def.kind === 'highway' || major.def.kind === 'boulevard' ? 'yield' : 'stop';
        }
      }
      this.intersections.push(inter);
      for (const a of inter.approaches) {
        if (!this.byRoad.has(a.road)) this.byRoad.set(a.road, []);
        this.byRoad.get(a.road)!.push(a);
      }
    }
    for (const list of this.byRoad.values()) list.sort((a, b) => a.s - b.s);
  }

  // ------------------------------------------------------------------ queries
  update(dt: number) {
    this.time += dt;
    this.lampTimer -= dt;
    if (this.lampTimer <= 0) {
      this.lampTimer = 0.2;
      this.updateLamps();
    }
  }

  /** Light for a phase group, and the seconds left in that state. */
  light(inter: Intersection, group: 0 | 1): { state: LightState; left: number } {
    let t = (this.time + inter.offset) % CYCLE;
    if (group === 1) t = (t + CYCLE / 2) % CYCLE;
    if (t < G) return { state: 'green', left: G - t };
    if (t < G + Y) return { state: 'yellow', left: G + Y - t };
    return { state: 'red', left: CYCLE - t };
  }

  /** Next controlled stop line ahead of (road, s, dir) within maxDist. */
  next(road: Road, s: number, dir: number, maxDist: number): { a: Approach; ds: number } | null {
    const list = this.byRoad.get(road);
    if (!list) return null;
    let best: Approach | null = null, bestD = maxDist;
    for (const a of list) {
      if (a.dir !== dir || a.control === 'none') continue;
      const ds = (a.s - s) * dir;
      if (ds > -1 && ds < bestD) {
        bestD = ds;
        best = a;
      }
    }
    return best ? { a: best, ds: bestD } : null;
  }

  /** May traffic on this approach go now? (signals only; STOP/YIELD are handled by the driver logic) */
  canGo(a: Approach, ds: number, speed: number): boolean {
    if (a.control !== 'signal') return true;
    const l = this.light(a.inter, a.group);
    if (l.state === 'green') return true;
    if (l.state === 'yellow') {
      // too close to stop comfortably: keep going
      return ds < (speed * speed) / (2 * 3.2) || ds < 3;
    }
    return false;
  }

  /** Pedestrians may cross the roads perpendicular to `road` at this intersection while `road`'s group is green. */
  walkAlong(inter: Intersection, road: Road): boolean {
    const a = inter.approaches.find((q) => q.road === road);
    if (!a || !inter.signal) return true;
    const l = this.light(inter, a.group);
    return l.state === 'green' && l.left > 6;
  }

  // ------------------------------------------------------------------ rendering
  buildMeshes(quality: number) {
    const signalAs = (this.signalApproaches = this.intersections.filter((i) => i.signal).flatMap((i) => i.approaches));
    const dark = new MeshStandardMaterial({ color: 0x23262b, metalness: 0.6, roughness: 0.45 });
    const m = new Matrix4();
    const o = new Object3D();
    // --- signal poles: mast + arm over the road + head (+ a second head on the mast)
    const pole = mergeGeometries([
      new CylinderGeometry(0.09, 0.11, 6, 8).translate(0, 3, 0),
      new CylinderGeometry(0.06, 0.06, 4.2, 6).rotateZ(Math.PI / 2).translate(-2.1, 5.8, 0),
      new BoxGeometry(0.36, 1.05, 0.28).translate(-3.9, 5.2, 0),
      new BoxGeometry(0.32, 0.95, 0.26).translate(0, 2.9, -0.2),
      new BoxGeometry(0.5, 1.3, 0.04).translate(-3.9, 5.2, 0.15),
    ].map((g) => g.toNonIndexed()))!;
    const poles = new InstancedMesh(pole, dark, Math.max(1, signalAs.length));
    const lampGeo = new CircleGeometry(0.11, 14);
    const mk = (col: number) => {
      const im = new InstancedMesh(lampGeo, new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), Math.max(1, signalAs.length * 2));
      im.instanceColor = new InstancedBufferAttribute(new Float32Array(im.count * 3), 3);
      im.instanceColor.setUsage(DynamicDrawUsage);
      im.userData.color = new Color(col);
      return im;
    };
    const lamps = (this.lamps = { red: mk(0xff2a1a), yellow: mk(0xffb300), green: mk(0x2bff8a) });
    const lampY = { red: 0.32, yellow: 0, green: -0.32 };
    signalAs.forEach((a, i) => {
      const rx = -a.hz, rz = a.hx; // right of the arriving traffic
      const off = a.road.halfWidth + 1.3;
      const yaw = Math.atan2(-a.hx, -a.hz); // face the arriving traffic
      o.position.set(a.x + rx * off, a.y + 0.1, a.z + rz * off);
      o.rotation.set(0, yaw, 0);
      o.updateMatrix();
      poles.setMatrixAt(i, o.matrix);
      for (const k of ['red', 'yellow', 'green'] as const) {
        // arm head (over the lanes) and mast head
        for (const [hx2, hy, hz2] of [[-3.9, 5.2, 0.15], [0, 2.9, -0.06]] as [number, number, number][]) {
          const idx = i * 2 + (hy > 4 ? 0 : 1);
          const lp = new Vector3(hx2, hy + lampY[k] * (hy > 4 ? 1 : 0.9), hz2 + 0.03).applyAxisAngle(new Vector3(0, 1, 0), yaw);
          o.position.set(a.x + rx * off + lp.x, a.y + 0.1 + lp.y, a.z + rz * off + lp.z);
          o.rotation.set(0, yaw, 0);
          o.updateMatrix();
          lamps[k].setMatrixAt(idx, o.matrix);
        }
      }
    });
    poles.castShadow = quality >= 2;
    this.group.add(poles, lamps.red, lamps.yellow, lamps.green);

    // --- stop lines + zebra crossings (city), painted on the road
    const paint = new MeshBasicMaterial({ color: 0xe8e8e2, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
    const stripes: Matrix4[] = [];
    for (const a of this.intersections.flatMap((i) => i.approaches)) {
      if (a.control === 'none') continue;
      const hw = a.road.halfWidth;
      const rx = -a.hz, rz = a.hx;
      // stop line across the arriving lanes (right half of the road)
      const lineLen = a.road.info.oneWay ? hw * 2 : hw - 0.3;
      const lc = a.road.info.oneWay ? 0 : hw / 2;
      m.compose(new Vector3(a.x + rx * lc, a.y + 0.05, a.z + rz * lc), new Object3D().rotateY(Math.atan2(a.hx, a.hz)).quaternion, new Vector3(lineLen, 1, a.control === 'yield' ? 0.25 : 0.45));
      stripes.push(m.clone());
      if (a.control === 'signal') {
        // zebra between the stop line and the junction: stripes along the road
        for (let k = -hw + 0.6; k <= hw - 0.6; k += 1.1) {
          const c = new Vector3(a.x + rx * k + a.hx * 2.2, a.y + 0.05, a.z + rz * k + a.hz * 2.2);
          m.compose(c, new Object3D().rotateY(Math.atan2(a.hx, a.hz)).quaternion, new Vector3(0.55, 1, 3.0));
          stripes.push(m.clone());
        }
      }
    }
    const quad = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const marks = new InstancedMesh(quad, paint, Math.max(1, stripes.length));
    stripes.forEach((mm, i) => marks.setMatrixAt(i, mm));
    marks.renderOrder = 1;
    this.group.add(marks);

    // --- road signs
    const signs = this.placeSigns();
    const post = new InstancedMesh(new CylinderGeometry(0.045, 0.045, 2.6, 6).translate(0, 1.3, 0), dark, Math.max(1, signs.length));
    signs.forEach((sg, i) => {
      o.position.set(sg.x, sg.y, sg.z);
      o.rotation.set(0, sg.yaw, 0);
      o.updateMatrix();
      post.setMatrixAt(i, o.matrix);
    });
    this.group.add(post);
    const byTex = new Map<string, typeof signs>();
    for (const sg of signs) {
      if (!byTex.has(sg.tex)) byTex.set(sg.tex, []);
      byTex.get(sg.tex)!.push(sg);
    }
    for (const [key, list] of byTex) {
      const face = signFace(key);
      const im = new InstancedMesh(face.geo, new MeshStandardMaterial({ map: face.tex, roughness: 0.55, metalness: 0.1, emissive: 0xffffff, emissiveMap: face.tex, emissiveIntensity: 0.12 }), list.length);
      list.forEach((sg, i) => {
        o.position.set(sg.x, sg.y + 2.45, sg.z);
        o.rotation.set(0, sg.yaw, 0);
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
      });
      this.group.add(im);
    }
    this.updateLamps();
  }

  /** Signs along the roads: STOP / YIELD at controlled approaches, speed limits, curve warnings. */
  private placeSigns() {
    const out: { x: number; y: number; z: number; yaw: number; tex: string }[] = [];
    const put = (r: Road, s: number, dir: number, tex: string, extra = 1.0) => {
      if (s < 1 || s > r.length - 1) return;
      r.pointAt(s, _pt);
      const hx = _pt.tx * dir, hz = _pt.tz * dir;
      const rx = -hz, rz = hx;
      const off = r.halfWidth + extra + (r.info.rails !== 'none' ? 0.6 : 0);
      out.push({ x: _pt.x + rx * off, y: _pt.y, z: _pt.z + rz * off, yaw: Math.atan2(-hx, -hz), tex });
    };
    for (const i of this.intersections)
      for (const a of i.approaches) {
        if (a.control === 'stop') put(a.road, a.s, a.dir, 'stop');
        else if (a.control === 'yield') put(a.road, a.s, a.dir, 'yield');
      }
    for (const r of this.roads.roads) {
      if (!r.info.traffic) continue;
      const kmh = Math.round((r.info.speed * 3.6) / 10) * 10;
      const limit = r.def.kind === 'highway' ? 120 : r.def.kind === 'street' ? 50 : r.def.kind === 'boulevard' ? 60 : r.def.kind === 'mountain' ? 60 : Math.min(90, kmh);
      // speed limits every ~700 m in both directions (and after each junction exit)
      const spacing = r.def.kind === 'street' ? 260 : 700;
      for (let s = 60; s < r.length - 40; s += spacing) {
        if (this.nearControl(r, s, 25)) continue;
        put(r, s, 1, 'speed' + limit);
        if (!r.info.oneWay) put(r, r.length - s, -1, 'speed' + limit);
      }
      // warning signs before sharp bends
      if (r.def.kind === 'road' || r.def.kind === 'mountain') {
        let last = -999;
        for (let i = 20; i < r.n - 20; i += 2) {
          const a = i - 15, b = i + 15;
          const cross = r.tx[a] * r.tz[b] - r.tz[a] * r.tx[b];
          const dot = r.tx[a] * r.tx[b] + r.tz[a] * r.tz[b];
          const turn = Math.atan2(cross, dot); // over 60 m
          if (Math.abs(turn) > 0.9 && i * 2 - last > 220) {
            last = i * 2;
            const s = i * 2;
            // turning right means positive cross with this convention? right = (-tz, tx)
            const rightTurn = turn < 0;
            put(r, s - 70, 1, rightTurn ? 'curveR' : 'curveL');
            if (!r.info.oneWay) put(r, s + 70, -1, rightTurn ? 'curveL' : 'curveR');
          }
        }
      }
    }
    return out;
  }

  private nearControl(r: Road, s: number, d: number) {
    return (this.byRoad.get(r) ?? []).some((a) => Math.abs(a.s - s) < d);
  }

  private updateLamps() {
    if (!this.lamps) return;
    const off = new Color(0.06, 0.05, 0.05);
    this.signalApproaches.forEach((a, i) => {
      const l = this.light(a.inter, a.group).state;
      for (const k of ['red', 'yellow', 'green'] as const) {
        const on = l === k;
        const c = on ? (this.lamps![k].userData.color as Color).clone().multiplyScalar(2.2) : off;
        this.lamps![k].setColorAt(i * 2, c);
        this.lamps![k].setColorAt(i * 2 + 1, c);
      }
    });
    for (const k of ['red', 'yellow', 'green'] as const) this.lamps[k].instanceColor!.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ sign faces
const faceCache = new Map<string, { geo: BufferGeometry; tex: CanvasTexture }>();
function signFace(key: string) {
  const hit = faceCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  let geo: BufferGeometry;
  g.clearRect(0, 0, 128, 128);
  if (key === 'stop') {
    g.fillStyle = '#ffffff';
    oct(g, 64, 64, 63);
    g.fillStyle = '#c8102e';
    oct(g, 64, 64, 57);
    g.fillStyle = '#ffffff';
    g.font = 'bold 34px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('STOP', 64, 66);
    geo = new CircleGeometry(0.42, 8, Math.PI / 8);
  } else if (key === 'yield') {
    // inverted triangle: canvas y grows downwards, apex at the bottom
    g.fillStyle = '#c8102e';
    tri(g, [6, 10, 122, 10, 64, 120]);
    g.fillStyle = '#ffffff';
    tri(g, [28, 22, 100, 22, 64, 92]);
    geo = triGeo(0.5);
  } else if (key.startsWith('speed')) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(64, 64, 63, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c8102e';
    g.beginPath();
    g.arc(64, 64, 63, 0, Math.PI * 2);
    g.arc(64, 64, 50, 0, Math.PI * 2, true);
    g.fill();
    g.fillStyle = '#111';
    g.font = 'bold 46px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(key.slice(5), 64, 67);
    geo = new CircleGeometry(0.36, 24);
  } else {
    // curve warning
    g.fillStyle = '#c8102e';
    tri(g, [64, 4, 124, 116, 4, 116]);
    g.fillStyle = '#ffffff';
    tri(g, [64, 26, 106, 104, 22, 104]);
    g.strokeStyle = '#111';
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.beginPath();
    const l = key === 'curveL';
    g.moveTo(64 + (l ? 10 : -10), 98);
    g.quadraticCurveTo(64 + (l ? 12 : -12), 62, 64 + (l ? -14 : 14), 52);
    g.stroke();
    g.fillStyle = '#111';
    g.beginPath();
    g.moveTo(64 + (l ? -28 : 28), 48);
    g.lineTo(64 + (l ? -8 : 8), 38);
    g.lineTo(64 + (l ? -10 : 10), 64);
    g.fill();
    geo = triGeo(0.55, true);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  // back of the sign: grey metal (second face, slightly behind)
  const back = geo.clone().rotateY(Math.PI).translate(0, 0, -0.01);
  const uv = back.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.01, 0.01);
  const merged = mergeGeometries([geo.index ? geo.toNonIndexed() : geo, back.index ? back.toNonIndexed() : back])!;
  const r = { geo: merged, tex };
  faceCache.set(key, r);
  return r;
}

function oct(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

function tri(g: CanvasRenderingContext2D, pts: number[]) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  g.lineTo(pts[2], pts[3]);
  g.lineTo(pts[4], pts[5]);
  g.closePath();
  g.fill();
}

/** Triangle sign face; `up` = warning sign (apex up), otherwise yield (apex down). */
function triGeo(size: number, up = false): BufferGeometry {
  const g = new BufferGeometry();
  const h = size * 1.73;
  const pos = up ? [-size, -h / 3, 0, size, -h / 3, 0, 0, (h * 2) / 3, 0] : [-size, h / 3, 0, 0, (-h * 2) / 3, 0, size, h / 3, 0];
  const uv = up ? [0.03, 0.09, 0.97, 0.09, 0.5, 0.97] : [0.06, 0.92, 0.5, 0.06, 0.94, 0.92];
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  return g;
}
