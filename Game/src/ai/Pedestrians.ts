import {
  BufferGeometry, CapsuleGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Scene,
  SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp } from '../core/MathUtil';
import { Rng } from '../core/Random';
import type { GroundHit } from '../physics/PhysicsWorld';
import type { Road } from '../world/RoadNetwork';
import type { TrafficControl } from '../world/TrafficControl';
import type { World } from '../world/World';
import { CITY } from '../world/WorldDef';

type PedState = 'walk' | 'wait' | 'cross' | 'dodge';

class Ped {
  active = false;
  road!: Road;
  s = 0;
  dir = 1;
  side = 1;
  lat = 0;
  latTarget = 0;
  speed = 1.3;
  state: PedState = 'walk';
  x = 0;
  y = 0;
  z = 0;
  heading = 0;
  phase = 0;
  vx = 0;
  vz = 0;
  t = 0;
  /** intersection index being waited at / crossed */
  crossing = -1;
}

const SKIN = [0xf1c7a5, 0xd9a07a, 0xb57a52, 0x8d5a3b, 0x5c3a24];
const SHIRT = [0xe8e8e8, 0x2b2f36, 0x1f4e8c, 0xb3261e, 0x2e7d4f, 0xd8b04a, 0x6b4aa0, 0xf08a24, 0x77808a, 0x111111];
const PANTS = [0x1e2a44, 0x2a2a2d, 0x4b3a2a, 0x6d6f73, 0x1b1b1d, 0x2f4f6f];

/** Low-poly person; vertex attributes mark body part (colour) and limb (animated in the vertex shader). */
function personGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (g: BufferGeometry, part: number, limb: number) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const n = ng.getAttribute('position').count;
    ng.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(n).fill(part), 1));
    ng.setAttribute('aLimb', new Float32BufferAttribute(new Float32Array(n).fill(limb), 1));
    ng.deleteAttribute('uv');
    parts.push(ng);
  };
  add(new CapsuleGeometry(0.17, 0.36, 3, 8).scale(1.05, 1, 0.68).translate(0, 1.23, 0), 1, 0); // torso
  add(new CapsuleGeometry(0.15, 0.08, 3, 8).scale(1.05, 1, 0.75).translate(0, 0.93, 0), 2, 0); // hips
  add(new SphereGeometry(0.105, 12, 10).scale(1, 1.12, 1.05).translate(0, 1.64, 0), 0, 0); // head
  add(new SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.67, 0.01), 3, 0); // hair
  add(new CapsuleGeometry(0.045, 0.06, 2, 6).translate(0, 1.5, 0), 0, 0); // neck
  for (const sx of [-1, 1]) {
    const leg = sx < 0 ? 1 : 2, arm = sx < 0 ? 3 : 4;
    add(new CapsuleGeometry(0.068, 0.72, 3, 8).translate(sx * 0.095, 0.5, 0), 2, leg);
    add(new CapsuleGeometry(0.05, 0.1, 2, 6).scale(1, 1, 2.2).rotateX(Math.PI / 2).translate(sx * 0.095, 0.06, -0.06), 3, leg); // shoe
    add(new CapsuleGeometry(0.048, 0.4, 3, 6).translate(sx * 0.23, 1.2, 0), 1, arm);
    add(new SphereGeometry(0.045, 8, 6).translate(sx * 0.23, 0.92, 0), 0, arm); // hand
  }
  return mergeGeometries(parts)!;
}

/**
 * City pedestrians: walk the sidewalks, wait at the kerb and cross on the zebra when their light is green,
 * jump out of the way of a fast car. Rendered as one instanced mesh with GPU walk animation.
 */
export class Pedestrians {
  private peds: Ped[] = [];
  private mesh: InstancedMesh;
  private attrs: { skin: InstancedBufferAttribute; shirt: InstancedBufferAttribute; pants: InstancedBufferAttribute; walk: InstancedBufferAttribute };
  private rng = new Rng(4242);
  private uTime = { value: 0 };
  private spawnT = 0;
  private g: GroundHit = { height: 0, normal: new Vector3(), surface: 0 as any, water: 0 };
  max = 60;
  control: TrafficControl | null = null;
  /** pedestrians currently on the carriageway (for traffic & AI to stop for) */
  readonly crossingBodies: { x: number; z: number }[] = [];
  onDodge?: () => void;

  constructor(private world: World, scene: Scene, capacity: number) {
    const geo = personGeometry();
    const n = capacity;
    const mk = (size: number) => {
      const a = new InstancedBufferAttribute(new Float32Array(n * size), size);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.attrs = { skin: mk(3), shirt: mk(3), pants: mk(3), walk: mk(3) };
    geo.setAttribute('aSkin', this.attrs.skin);
    geo.setAttribute('aShirt', this.attrs.shirt);
    geo.setAttribute('aPants', this.attrs.pants);
    geo.setAttribute('aWalk', this.attrs.walk);
    const mat = new MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aPart; attribute float aLimb;
          attribute vec3 aSkin; attribute vec3 aShirt; attribute vec3 aPants; attribute vec3 aWalk;
          uniform float uTime; varying vec3 vPedColor;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float sw = sin(uTime * aWalk.z + aWalk.x) * aWalk.y;
          if (aLimb > 0.5) {
            bool leg = aLimb < 2.5;
            float pivot = leg ? 0.9 : 1.42;
            float sgn = mod(aLimb, 2.0) > 0.5 ? 1.0 : -1.0;
            float ang = sw * sgn * (leg ? 1.0 : -0.75);
            vec3 q = transformed - vec3(0.0, pivot, 0.0);
            float c = cos(ang), s = sin(ang);
            transformed = vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c) + vec3(0.0, pivot, 0.0);
          }
          transformed.y += abs(sw) * 0.04;
          vPedColor = aPart < 0.5 ? aSkin : aPart < 1.5 ? aShirt : aPart < 2.5 ? aPants : vec3(0.06, 0.05, 0.05);`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPedColor;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vPedColor, opacity );');
    };
    this.mesh = new InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    for (let i = 0; i < n; i++) this.peds.push(new Ped());
  }

  private inCity(x: number, z: number) {
    return x > CITY.x0 - 20 && x < CITY.x1 + 20 && z > CITY.z0 - 20 && z < CITY.z1 + 20;
  }

  private spawn(px: number, pz: number) {
    const p = this.peds.find((q) => !q.active);
    if (!p) return;
    const a = this.rng.next() * Math.PI * 2, d = 25 + this.rng.next() * 110;
    const x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d;
    if (!this.inCity(x, z)) return;
    const hit = this.world.data.roads.nearest(x, z, 30);
    if (!hit || (hit.road.def.kind !== 'street' && hit.road.def.kind !== 'boulevard')) return;
    const r = hit.road;
    if (this.zoneAt(r, hit.s)) return;
    p.active = true;
    p.road = r;
    p.s = hit.s;
    p.dir = this.rng.chance(0.5) ? 1 : -1;
    p.side = this.rng.chance(0.5) ? 1 : -1;
    p.lat = p.latTarget = p.side * (r.halfWidth + 1.2 + this.rng.next() * 1.4);
    p.speed = 1.05 + this.rng.next() * 0.55;
    p.state = 'walk';
    p.phase = this.rng.next() * 6.28;
    p.crossing = -1;
    const i = this.peds.indexOf(p);
    const c = new Color();
    c.setHex(this.rng.pick(SKIN)).toArray(this.attrs.skin.array as Float32Array, i * 3);
    c.setHex(this.rng.pick(SHIRT)).toArray(this.attrs.shirt.array as Float32Array, i * 3);
    c.setHex(this.rng.pick(PANTS)).toArray(this.attrs.pants.array as Float32Array, i * 3);
    this.attrs.skin.needsUpdate = this.attrs.shirt.needsUpdate = this.attrs.pants.needsUpdate = true;
  }

  /** Crossing zone (an intersection) on road r around arc length s: [start, end, interIndex] */
  private zoneAt(r: Road, s: number): { s0: number; s1: number; inter: number; signal: boolean } | null {
    const ctl = this.control;
    if (!ctl) return null;
    for (const I of ctl.intersections) {
      if (!I.roads.includes(r)) continue;
      const own = I.approaches.filter((q) => q.road === r);
      if (!own.length) continue;
      // the zone spans between this road's stop lines (one each side of the junction)
      const ss = own.map((q) => q.s);
      let s0 = Math.min(...ss), s1 = Math.max(...ss);
      if (own.length === 1) {
        const q = own[0];
        s0 = Math.min(q.s, q.s + q.dir * 18);
        s1 = Math.max(q.s, q.s + q.dir * 18);
      }
      if (s >= s0 - 1.5 && s <= s1 + 1.5) return { s0, s1, inter: I.id, signal: I.signal };
    }
    return null;
  }

  update(dt: number, player: { x: number; z: number; vx: number; vz: number }) {
    this.uTime.value += dt;
    this.spawnT -= dt;
    const active = this.peds.reduce((a, p) => a + (p.active ? 1 : 0), 0);
    const nearCity = this.inCity(player.x, player.z);
    if (nearCity && active < this.max && this.spawnT <= 0) {
      this.spawnT = 0.05;
      this.spawn(player.x, player.z);
    }
    this.crossingBodies.length = 0;
    const pt = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
    const psp = Math.hypot(player.vx, player.vz);
    let n = 0;
    const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), one = new Vector3(1, 1, 1), pos = new Vector3();
    const walk = this.attrs.walk.array as Float32Array;
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      if (!p.active) continue;
      if (Math.hypot(p.x - player.x, p.z - player.z) > 175 && p.t > 1) {
        p.active = false;
        continue;
      }
      p.t += dt;
      // react to a car coming at them
      const rx = p.x - player.x, rz = p.z - player.z;
      const dist = Math.hypot(rx, rz);
      if (p.state !== 'dodge' && psp > 3 && dist < 9) {
        const along = (rx * player.vx + rz * player.vz) / psp;
        const lateral = Math.abs(rx * player.vz - rz * player.vx) / psp;
        if (along > -1 && lateral < 2.4 && along / psp < 1.6) {
          // jump sideways, away from the car's path
          const sgn = Math.sign(rx * player.vz - rz * player.vx) || 1;
          p.vx = (player.vz / psp) * sgn * 5.2;
          p.vz = (-player.vx / psp) * sgn * 5.2;
          p.state = 'dodge';
          p.t = 0;
          this.onDodge?.();
        }
      }
      const r = p.road;
      if (p.state === 'dodge') {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.heading = Math.atan2(-p.vx, -p.vz);
        if (p.t > 0.75) {
          // back to walking: re-project onto the road
          const h = this.world.data.roads.nearest(p.x, p.z, 40);
          if (h) {
            p.road = h.road;
            p.s = h.s;
            p.lat = h.lateral;
            p.side = Math.sign(h.lateral) || 1;
            p.latTarget = p.side * (h.road.halfWidth + 1.2 + Math.random() * 1.2);
          }
          p.state = 'walk';
        }
      } else {
        // walking along the sidewalk; at a crossing wait for the walk phase, once on the zebra keep going
        if (p.state === 'cross') {
          if (p.t > 1 && !this.zoneAt(r, p.s)) {
            p.state = 'walk';
            p.t = 0;
          }
        } else {
          const zone = this.zoneAt(r, p.s + p.dir * 1.2);
          if (!zone) p.state = 'walk';
          else if (!zone.signal || !this.control) p.dir = -p.dir; // no lights here: turn back
          else if (this.control.walkAlong(this.control.intersections[zone.inter], r)) {
            p.state = 'cross';
            p.t = 0;
          } else p.state = 'wait';
        }
        const v = p.state === 'wait' ? 0 : p.state === 'cross' ? p.speed * 1.25 : p.speed;
        p.s += p.dir * v * dt;
        if (!r.loop && (p.s < 3 || p.s > r.length - 3)) {
          p.dir = -p.dir;
          p.s = clamp(p.s, 3, r.length - 3);
        }
        if (r.loop) p.s = ((p.s % r.length) + r.length) % r.length;
        p.lat += (p.latTarget - p.lat) * Math.min(1, dt * 2);
        r.pointAt(p.s, pt);
        p.x = pt.x - pt.tz * p.lat;
        p.z = pt.z + pt.tx * p.lat;
        p.heading = Math.atan2(-pt.tx * p.dir, -pt.tz * p.dir);
        if (p.state === 'cross') this.crossingBodies.push({ x: p.x, z: p.z });
      }
      // never stand inside the player's car
      if (dist < 1.3) {
        p.x = player.x + (rx / (dist || 1)) * 1.3;
        p.z = player.z + (rz / (dist || 1)) * 1.3;
      }
      this.world.sampleGround(p.x, p.z, p.y + 1.5, this.g);
      p.y = this.g.height;
      // walk animation: stride frequency follows speed
      const moving = p.state === 'wait' ? 0 : 1;
      walk[n * 3] = p.phase;
      walk[n * 3 + 1] = moving * (p.state === 'dodge' ? 0.7 : 0.42);
      walk[n * 3 + 2] = p.state === 'dodge' ? 14 : p.speed * 5.2;
      // keep the per-instance colours aligned with the compacted instance index
      if (n !== i) {
        for (const a of [this.attrs.skin, this.attrs.shirt, this.attrs.pants]) {
          const arr = a.array as Float32Array;
          arr[n * 3] = arr[i * 3];
          arr[n * 3 + 1] = arr[i * 3 + 1];
          arr[n * 3 + 2] = arr[i * 3 + 2];
        }
      }
      q.setFromAxisAngle(up, p.heading + Math.PI);
      m.compose(pos.set(p.x, p.y, p.z), q, one);
      this.mesh.setMatrixAt(n, m);
      n++;
    }
    // compaction moved colours; re-sync the pool so slot i keeps its look next frame
    if (n) {
      let k = 0;
      for (let i = 0; i < this.peds.length; i++) {
        if (!this.peds[i].active) continue;
        if (k !== i) {
          // swap ped objects so that active peds occupy the first slots (colours already copied)
          const tmp = this.peds[k];
          this.peds[k] = this.peds[i];
          this.peds[i] = tmp;
        }
        k++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.attrs.walk.needsUpdate = true;
    this.attrs.skin.needsUpdate = this.attrs.shirt.needsUpdate = this.attrs.pants.needsUpdate = true;
  }

  clear() {
    for (const p of this.peds) p.active = false;
    this.mesh.count = 0;
  }
}
