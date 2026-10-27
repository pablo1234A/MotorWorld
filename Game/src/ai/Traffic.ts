import {
  BufferGeometry, Color, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Scene, Vector3,
} from 'three';
import { clamp, lerp, moveTowards, smoothstep } from '../core/MathUtil';
import { Rng } from '../core/Random';
import type { KinematicBody } from '../physics/CollisionSystem';
import { TRAFFIC_BODIES } from '../vehicles/CarCatalog';
import { CarModel } from '../vehicles/CarModel';
import { CELL, cellUV, getDetailMaterial } from '../vehicles/CarMaterials';
import { headlightTextures, taillightTextures } from '../vehicles/CarDetails';
import { defaultVisual } from '../vehicles/Tuning';
import { buildWheel, mergeParts } from '../vehicles/WheelBuilder';
import { RF, type Road } from '../world/RoadNetwork';
import type { World } from '../world/World';
import type { BodyStyle } from '../vehicles/BodyStyle';

interface TypeAssets {
  body: BodyStyle;
  bodyGeo: BufferGeometry; // groups 0 paint, 1 glass
  detailGeo: BufferGeometry;
  headGeo: BufferGeometry;
  tailGeo: BufferGeometry;
  bodyIM: InstancedMesh;
  detailIM: InstancedMesh;
  headIM: InstancedMesh;
  tailIM: InstancedMesh;
  /** amber indicator lamps, left and right blink independently (instance colour) */
  indLIM: InstancedMesh;
  indRIM: InstancedMesh;
  wheelPos: Vector3[];
  colors: number[];
}

const AMBER_ON = new Color(1.9, 0.95, 0.12);
const AMBER_OFF = new Color(0.32, 0.17, 0.03);

export class TrafficCar implements KinematicBody {
  active = false;
  type = 0;
  slot = 0;
  road!: Road;
  s = 0;
  dir = 1;
  lane = 0;
  lat = 0; // current lateral offset
  latTarget = 0;
  speed = 0;
  cruise = 15;
  braking = false;
  indicator = 0;
  crashed = false;
  crashTime = 0;
  yawRate = 0;
  x = 0;
  y = 0;
  z = 0;
  heading = 0;
  vx = 0;
  vz = 0;
  hx = 1;
  hz = 2.3;
  mass = 1400;
  spin = 0;
  color = new Color();
  nearMissArmed = true;
  minDist = 99;
  hornTimer = 0;
  pendingImpulse: [number, number, number, number] | null = null;
  hit(jx: number, jz: number, px: number, pz: number) {
    this.pendingImpulse = [jx, jz, px, pz];
  }
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const _c = new Color();
const UP = new Vector3(0, 1, 0);
const pt = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };

export interface TrafficEvents {
  nearMiss?: (car: TrafficCar, dist: number) => void;
  horn?: (car: TrafficCar) => void;
  crash?: (car: TrafficCar, speed: number) => void;
}

/**
 * AI traffic: lane following on the road network, Intelligent Driver Model car-following,
 * opportunistic lane changes, junction continuation, reaction to the player and crash physics.
 * Rendered with one instanced mesh per vehicle type and part (≈4 draw calls per type).
 */
export class Traffic {
  readonly cars: TrafficCar[] = [];
  private types: TypeAssets[] = [];
  private wheelIM: InstancedMesh;
  private group = new Group();
  private rng = new Rng(777);
  private maxCars: number;
  density = 1;
  enabled = true;
  rainFactor = 1;
  night = 0;
  events: TrafficEvents = {};
  private spawnTimer = 0;
  private playerS = new Map<Road, { s: number; lat: number }>();

  constructor(private world: World, scene: Scene, capacity: number, quality: number) {
    this.maxCars = capacity;
    scene.add(this.group);
    const paint = new MeshStandardMaterial({ color: 0xffffff, metalness: 0.45, roughness: 0.35, envMapIntensity: 1.2 });
    const glass = new MeshStandardMaterial({ color: 0x1a2028, metalness: 0.3, roughness: 0.08, envMapIntensity: 1.5 });
    const trim = new MeshStandardMaterial({ color: 0x060607, metalness: 0.1, roughness: 0.2 });
    const indMat = new MeshBasicMaterial({ color: 0xffffff });
    TRAFFIC_BODIES.forEach((tb, ti) => {
      const headMat = new MeshBasicMaterial({ color: 0xffffff, map: headlightTextures(tb.body.headlight).map });
      const tailMat = new MeshBasicMaterial({ color: 0xffffff, map: taillightTextures(tb.body.taillight).map });
      const v = defaultVisual({ id: tb.id, category: 'sedan', color: 0xffffff } as any);
      v.rimStyle = ti % 3 === 0 ? 4 : ti % 3 === 1 ? 0 : 5;
      const model = new CarModel(tb.body, v, { quality: Math.min(1, quality), interior: false, wingLevel: 0, splitterLevel: 0, diffuserLevel: 0 });
      let bodyGeo: BufferGeometry | null = null, detailGeo: BufferGeometry | null = null, headGeo: BufferGeometry | null = null, tailGeo: BufferGeometry | null = null;
      const paintParts: BufferGeometry[] = [];
      for (const ch of model.bodyGroup.children) {
        const m = ch as Mesh;
        if (!m.isMesh) continue;
        if (Array.isArray(m.material)) bodyGeo = m.geometry;
        else if (m.material === model.mats.detail) detailGeo = m.geometry;
        else if (m.material === model.mats.head) headGeo = m.geometry;
        else if (m.material === model.mats.tail) tailGeo = m.geometry;
        else if (m.material === model.mats.paint) paintParts.push(m.geometry);
      }
      // bake the projected details into the shared atlas so a traffic car stays a handful of draw calls
      const pp = model.parts!;
      const atl = (arr: BufferGeometry[], cell: number, pattern: boolean) => arr.map((g) => cellUV(g.clone(), cell, pattern));
      detailGeo = mergeParts([detailGeo!, ...atl(pp.grille, CELL.grille, true), ...atl(pp.plate, CELL.plate, true), ...atl(pp.trim, CELL.gloss, false), ...atl(pp.rev, CELL.alu, false)]);
      if (pp.drl.length) headGeo = mergeParts([headGeo!, ...pp.drl]);
      const indLGeo = pp.indL.length ? mergeParts(pp.indL) : new BufferGeometry();
      const indRGeo = pp.indR.length ? mergeParts(pp.indR) : new BufferGeometry();
      const cap = Math.max(2, Math.ceil(capacity * 0.7));
      const bodyIM = new InstancedMesh(bodyGeo!, [paint, glass, trim], cap);
      const detailIM = new InstancedMesh(detailGeo!, getDetailMaterial(), cap);
      const headIM = new InstancedMesh(headGeo!, headMat, cap);
      const tailIM = new InstancedMesh(tailGeo!, tailMat, cap);
      const indLIM = new InstancedMesh(indLGeo, indMat, cap);
      const indRIM = new InstancedMesh(indRGeo, indMat, cap);
      for (const im of [bodyIM, detailIM, headIM, tailIM, indLIM, indRIM]) {
        im.count = 0;
        im.instanceMatrix.setUsage(DynamicDrawUsage);
        im.frustumCulled = false;
        this.group.add(im);
      }
      bodyIM.castShadow = quality >= 2;
      bodyIM.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      headIM.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      tailIM.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      indLIM.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      indRIM.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      const p = model.profile;
      const b = tb.body;
      const wheelPos = [
        new Vector3(-b.trackF / 2, b.wheelRadius, p.axleF), new Vector3(b.trackF / 2, b.wheelRadius, p.axleF),
        new Vector3(-b.trackR / 2, b.wheelRadius, p.axleR), new Vector3(b.trackR / 2, b.wheelRadius, p.axleR),
      ];
      this.types.push({ body: b, bodyGeo: bodyGeo!, detailGeo: detailGeo!, headGeo: headGeo!, tailGeo: tailGeo!, bodyIM, detailIM, headIM, tailIM, indLIM, indRIM, wheelPos, colors: tb.colors });
      void paintParts;
    });
    // shared unit wheel (radius 1, width 0.7) scaled per instance
    const wg = buildWheel(1, 0.7, 4, 0, false, 0);
    const wheelGeo = mergeParts([wg.tire.clone(), wg.rim.clone()]);
    this.wheelIM = new InstancedMesh(wheelGeo, getDetailMaterial(), capacity * 4);
    this.wheelIM.instanceMatrix.setUsage(DynamicDrawUsage);
    this.wheelIM.frustumCulled = false;
    this.wheelIM.count = 0;
    this.group.add(this.wheelIM);
    for (let i = 0; i < capacity; i++) this.cars.push(new TrafficCar());
  }

  get activeBodies(): KinematicBody[] {
    return this.cars.filter((c) => c.active);
  }

  clear() {
    for (const c of this.cars) c.active = false;
  }

  setCapacity(n: number) {
    this.maxCars = Math.min(n, this.cars.length);
  }

  private pickType(): number {
    const total = TRAFFIC_BODIES.reduce((a, b) => a + b.weight, 0);
    let r = this.rng.next() * total;
    for (let i = 0; i < TRAFFIC_BODIES.length; i++) {
      r -= TRAFFIC_BODIES[i].weight;
      if (r <= 0) return i;
    }
    return 0;
  }

  private trySpawn(px: number, pz: number, fwdX: number, fwdZ: number) {
    const car = this.cars.find((c) => !c.active);
    if (!car) return;
    // sample a point on a ring around the player, biased ahead
    const ang = Math.atan2(fwdX, fwdZ) + (this.rng.next() - 0.5) * (this.rng.chance(0.75) ? 1.6 : 6.28);
    const dist = 170 + this.rng.next() * 200;
    const x = px + Math.sin(ang) * dist, z = pz + Math.cos(ang) * dist;
    const hit = this.world.data.roads.nearest(x, z, 40);
    if (!hit || !hit.road.info.traffic) return;
    const r = hit.road;
    const i = Math.round(r.sToI(hit.s));
    if (r.flags[i] & RF.junction) return;
    // keep spacing
    for (const o of this.cars) if (o.active && o.road === r && Math.abs(o.s - hit.s) < 30) return;
    const dir = r.info.oneWay ? 1 : this.rng.chance(0.5) ? 1 : -1;
    const lane = this.rng.int(0, r.info.lanesPerDir - 1);
    car.active = true;
    car.crashed = false;
    car.road = r;
    car.s = hit.s;
    car.dir = dir;
    car.lane = lane;
    car.lat = car.latTarget = r.laneOffset(lane, dir);
    car.type = this.pickType();
    const tb = TRAFFIC_BODIES[car.type];
    car.color.setHex(tb.colors[this.rng.int(0, tb.colors.length - 1)]);
    car.cruise = r.info.speed * (0.82 + this.rng.next() * 0.3) * (r.info.lanesPerDir > 1 && lane === 0 ? 0.9 : 1);
    car.speed = car.cruise * 0.9;
    car.hx = tb.body.width / 2;
    car.hz = tb.body.length / 2;
    car.mass = tb.body.kind === 'truck' || tb.body.kind === 'bus' ? 9000 : tb.body.kind === 'van' ? 2600 : 1500;
    car.nearMissArmed = true;
    car.minDist = 99;
    car.pendingImpulse = null;
    this.place(car);
  }

  private place(car: TrafficCar) {
    car.road.pointAt(car.s, pt);
    const rx = -pt.tz, rz = pt.tx;
    car.x = pt.x + rx * car.lat;
    car.z = pt.z + rz * car.lat;
    car.y = pt.y;
    const tx = pt.tx * car.dir, tz = pt.tz * car.dir;
    car.heading = Math.atan2(-tx, -tz);
    car.vx = tx * car.speed;
    car.vz = tz * car.speed;
  }

  /** Project the player onto nearby roads (used for leader detection). */
  private updatePlayerProjection(px: number, pz: number) {
    this.playerS.clear();
    this.world.data.roads.query(px, pz, 4, (h) => this.playerS.set(h.road, { s: h.s, lat: h.lateral }));
  }

  update(dt: number, player: { x: number; y: number; z: number; vx: number; vz: number; fx: number; fz: number; speed: number }, extraBodies: { x: number; z: number }[] = []) {
    if (!this.enabled) {
      for (const c of this.cars) c.active = false;
      this.render();
      return;
    }
    const target = Math.round(this.maxCars * this.density);
    const active = this.cars.filter((c) => c.active).length;
    this.spawnTimer -= dt;
    if (active < target && this.spawnTimer <= 0) {
      this.spawnTimer = 0.15;
      this.trySpawn(player.x, player.z, player.fx, player.fz);
    }
    this.updatePlayerProjection(player.x, player.z);
    const ps = Math.hypot(player.vx, player.vz);
    for (const car of this.cars) {
      if (!car.active) continue;
      const dx = car.x - player.x, dz = car.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > 480 || (car.crashed && d > 160 && car.crashTime > 6)) {
        car.active = false;
        continue;
      }
      if (car.pendingImpulse) {
        const [jx, jz, px, pz] = car.pendingImpulse;
        car.pendingImpulse = null;
        const dv = Math.hypot(jx, jz) / car.mass;
        if (!car.crashed && dv > 0.6) {
          car.crashed = true;
          car.crashTime = 0;
          car.vx = -Math.sin(car.heading) * car.speed;
          car.vz = -Math.cos(car.heading) * car.speed;
          this.events.crash?.(car, dv);
        }
        if (car.crashed) {
          car.vx += jx / car.mass;
          car.vz += jz / car.mass;
          // angular impulse about Y from the off-centre contact
          const rx = px - car.x, rz = pz - car.z;
          const inertia = (car.mass * (car.hx * car.hx + car.hz * car.hz)) / 3;
          car.yawRate = clamp(car.yawRate + (rz * jx - rx * jz) / inertia, -4, 4);
        } else {
          car.speed = Math.max(0, car.speed - dv);
        }
      }
      if (car.crashed) this.updateCrashed(car, dt);
      else this.updateDriving(car, dt, player, ps, extraBodies);
      // near miss detection
      if (!car.crashed && ps > 16) {
        if (d < 7) car.minDist = Math.min(car.minDist, d);
        const ahead = dx * player.fx + dz * player.fz;
        if (car.minDist < 4.2 && ahead < -3 && car.nearMissArmed) {
          car.nearMissArmed = false;
          this.events.nearMiss?.(car, car.minDist);
        }
        if (d > 12) car.minDist = 99;
      }
    }
    this.render();
  }

  private updateDriving(car: TrafficCar, dt: number, player: { x: number; z: number; vx: number; vz: number; speed: number }, playerSpeed: number, extra: { x: number; z: number }[]) {
    const r = car.road;
    // ---- leader detection (same road, same direction, overlapping lateral) ----
    let gap = 200, leaderV = car.cruise;
    for (const o of this.cars) {
      if (o === car || !o.active || o.road !== r) continue;
      if (!o.crashed && o.dir !== car.dir) continue;
      let ds = (o.s - car.s) * car.dir;
      if (r.loop) ds = ((ds % r.length) + r.length) % r.length;
      if (ds <= 0 || ds > gap) continue;
      if (Math.abs(o.lat - car.lat) > 2.6 && Math.abs(o.latTarget - car.lat) > 2.6) continue;
      gap = ds - car.hz - o.hz;
      leaderV = o.crashed ? 0 : o.speed;
    }
    const pp = this.playerS.get(r);
    if (pp) {
      let ds = (pp.s - car.s) * car.dir;
      if (r.loop) ds = ((ds % r.length) + r.length) % r.length;
      if (ds > 0 && ds < gap && Math.abs(pp.lat - car.lat) < 2.6) {
        gap = ds - car.hz - 2.3;
        const pv = (player.vx * (r.tx[Math.round(r.sToI(pp.s))] ?? 0) + player.vz * (r.tz[Math.round(r.sToI(pp.s))] ?? 0)) * car.dir;
        leaderV = Math.max(0, pv);
        if (gap < 10 && playerSpeed < 2) {
          car.hornTimer -= dt;
          if (car.hornTimer <= 0) {
            car.hornTimer = 3 + Math.random() * 3;
            this.events.horn?.(car);
          }
        }
      }
    }
    for (const e of extra) {
      const dx = e.x - car.x, dz = e.z - car.z;
      const ahead = dx * -Math.sin(car.heading) + dz * -Math.cos(car.heading);
      const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
      if (ahead > 0 && ahead < gap && side < 2.4) {
        gap = ahead - car.hz - 2.3;
        leaderV = 0;
      }
    }
    // curvature-limited speed (look ahead)
    const i0 = Math.round(r.sToI(car.s));
    const look = Math.round(r.sToI(car.s + car.dir * clamp(car.speed * 2.5, 10, 60)));
    const turn = Math.abs(Math.atan2(r.tx[i0] * r.tz[look] - r.tz[i0] * r.tx[look], r.tx[i0] * r.tx[look] + r.tz[i0] * r.tz[look]));
    let v0 = car.cruise * this.rainFactor;
    if (turn > 0.15) v0 = Math.min(v0, Math.max(7, car.cruise * (1 - turn * 0.9)));
    // ---- IDM ----
    const aMax = 2.0, bComf = 3.2, T = 1.3, s0 = 3.5;
    const v = car.speed;
    const sStar = s0 + Math.max(0, v * T + (v * (v - leaderV)) / (2 * Math.sqrt(aMax * bComf)));
    let acc = aMax * (1 - Math.pow(v / Math.max(1, v0), 4) - Math.pow(sStar / Math.max(0.5, gap), 2));
    acc = clamp(acc, -9, aMax);
    car.speed = Math.max(0, v + acc * dt);
    car.braking = acc < -1.0 || car.speed < 0.5;
    // ---- lane change ----
    if (r.info.lanesPerDir > 1 && Math.abs(car.lat - car.latTarget) < 0.05) {
      if (gap < 45 && leaderV < car.cruise * 0.85 && Math.random() < dt * 0.8) {
        const nl = car.lane === 0 ? 1 : car.lane - 1;
        const nlat = r.laneOffset(nl, car.dir);
        const free = !this.cars.some((o) => o.active && o !== car && o.road === r && o.dir === car.dir && Math.abs(o.lat - nlat) < 2 && Math.abs(o.s - car.s) < 22);
        if (free) {
          car.lane = nl;
          car.latTarget = nlat;
          car.indicator = Math.sign(nlat - car.lat) * car.dir;
        }
      }
    }
    car.lat = moveTowards(car.lat, car.latTarget, dt * 1.3);
    if (Math.abs(car.lat - car.latTarget) < 0.01) car.indicator = 0;
    // ---- advance & junctions ----
    car.s += car.dir * car.speed * dt;
    if (!r.loop && (car.s < 0 || car.s > r.length)) this.continueAtEnd(car);
    else if (r.loop) car.s = ((car.s % r.length) + r.length) % r.length;
    this.place(car);
    car.spin += (car.speed / 0.33) * dt;
  }

  private continueAtEnd(car: TrafficCar) {
    const r = car.road;
    const atEnd = car.s > r.length;
    const endS = atEnd ? r.length : 0;
    const opts = r.junctions.filter((j) => j.end && Math.abs(j.s - endS) < 10 && j.road.info.traffic);
    if (opts.length) {
      const j = opts[Math.floor(Math.random() * opts.length)];
      const o = j.road;
      car.road = o;
      // choose a direction on the new road heading away from the junction
      let dir: number;
      if (!o.loop && j.otherS < 15) dir = 1;
      else if (!o.loop && j.otherS > o.length - 15) dir = -1;
      else dir = Math.random() < 0.5 ? 1 : -1;
      if (o.info.oneWay) dir = 1;
      car.dir = dir;
      car.s = j.otherS + dir * 4;
      car.lane = Math.min(car.lane, o.info.lanesPerDir - 1);
      car.lat = car.latTarget = o.laneOffset(car.lane, dir);
      car.cruise = o.info.speed * (0.85 + Math.random() * 0.25);
      car.speed = Math.min(car.speed, 8);
    } else {
      // dead end: turn around
      car.dir = -car.dir;
      car.s = clamp(car.s, 0, r.length);
      car.lat = car.latTarget = r.laneOffset(car.lane, car.dir);
    }
  }

  private updateCrashed(car: TrafficCar, dt: number) {
    car.crashTime += dt;
    const sp = Math.hypot(car.vx, car.vz);
    if (sp > 0.01) {
      const dec = Math.min(sp, 7 * dt);
      car.vx -= (car.vx / sp) * dec;
      car.vz -= (car.vz / sp) * dec;
    }
    car.yawRate *= Math.exp(-2.2 * dt);
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    car.heading += car.yawRate * dt;
    const g = { height: 0, normal: _p, surface: 0 as any, water: 0 };
    this.world.sampleGround(car.x, car.z, car.y + 1, g);
    car.y = lerp(car.y, g.height, 1 - Math.exp(-10 * dt));
    car.speed = 0;
    car.spin += (sp / 0.33) * dt;
    car.braking = true;
  }

  private render() {
    const counts = new Array(this.types.length).fill(0);
    let wheels = 0;
    const blink = Math.floor(performance.now() / 360) % 2 === 0;
    for (const car of this.cars) {
      if (!car.active) continue;
      const T = this.types[car.type];
      const k = counts[car.type]++;
      if (k >= T.bodyIM.instanceMatrix.count) continue;
      _q.setFromAxisAngle(UP, car.heading);
      _p.set(car.x, car.y, car.z);
      _m.compose(_p, _q, _s);
      T.bodyIM.setMatrixAt(k, _m);
      T.detailIM.setMatrixAt(k, _m);
      T.headIM.setMatrixAt(k, _m);
      T.tailIM.setMatrixAt(k, _m);
      T.indLIM.setMatrixAt(k, _m);
      T.indRIM.setMatrixAt(k, _m);
      T.bodyIM.setColorAt(k, car.color);
      // indicators: positive = right; crashed cars put the hazards on
      const indOn = blink && (car.crashed || car.indicator !== 0);
      T.indLIM.setColorAt(k, indOn && (car.crashed || car.indicator < 0) ? AMBER_ON : AMBER_OFF);
      T.indRIM.setColorAt(k, indOn && (car.crashed || car.indicator > 0) ? AMBER_ON : AMBER_OFF);
      const hl = 0.35 + this.night * 1.8;
      T.headIM.setColorAt(k, _c.setRGB(hl, hl, hl * 0.92));
      const hazard = car.crashed && blink;
      const br = car.braking ? 1.6 : 0.35 + this.night * 0.6;
      T.tailIM.setColorAt(k, hazard ? _c.setRGB(1.6, 0.7, 0.1) : _c.setRGB(br, 0.03, 0.03));
      for (let w = 0; w < 4; w++) {
        const wp = T.wheelPos[w];
        _p.copy(wp).applyAxisAngle(UP, car.heading).add(new Vector3(car.x, car.y, car.z));
        const q2 = new Quaternion().setFromAxisAngle(UP, car.heading);
        if (wp.x < 0) q2.multiply(new Quaternion().setFromAxisAngle(UP, Math.PI));
        q2.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (wp.x < 0 ? 1 : -1) * car.spin));
        const R = T.body.wheelRadius;
        _m.compose(_p, q2, new Vector3(R, R, R));
        if (wheels < this.wheelIM.instanceMatrix.count) this.wheelIM.setMatrixAt(wheels++, _m);
      }
    }
    this.types.forEach((T, i) => {
      for (const im of [T.bodyIM, T.detailIM, T.headIM, T.tailIM, T.indLIM, T.indRIM]) {
        im.count = Math.min(counts[i], im.instanceMatrix.count);
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    });
    this.wheelIM.count = wheels;
    this.wheelIM.instanceMatrix.needsUpdate = true;
  }

  /** Nearest active traffic car to a point (for audio). */
  nearest(x: number, z: number, n: number): TrafficCar[] {
    return this.cars
      .filter((c) => c.active && !c.crashed)
      .map((c) => [c, (c.x - x) ** 2 + (c.z - z) ** 2] as [TrafficCar, number])
      .sort((a, b) => a[1] - b[1])
      .slice(0, n)
      .map((a) => a[0]);
  }
}

export { smoothstep };
