import {
  Box3, Camera, AdditiveBlending, BufferGeometry, Color, CylinderGeometry, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, Scene, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, smoothstep } from '../core/MathUtil';
import type { GroundHit, PhysicsWorld, StaticCollider } from '../physics/PhysicsWorld';
import { Surface } from '../physics/Surface';
import { concreteMaterial, facadeMaterial, roadMaterial, terrainMaterial, vcMaterial, WU } from './Materials';
import { buildChunkRoads } from './RoadMesh';
import { RF, ROAD_STEP } from './RoadNetwork';
import { buildChunkStructures, buildSkyline, Structures } from './Structures';
import { Ground } from './Ground';
import { Occlusion } from './Occlusion';
import { buildFarTerrain, buildTerrainChunk } from './TerrainMesh';
import { radialTexture, SHOULDER } from './Textures';
import { buildTreeMeshes, scatterChunk } from './Vegetation';
import { buildRiver, buildSea } from './Water';
import type { WorldData } from './WorldGen';
import { CHUNK_SIZE, CHUNKS, CITY_Y, HALF, type RoadKind } from './WorldDef';

interface Chunk {
  box: Box3;
  cx: number;
  cz: number;
  lod: number;
  group: Group;
  terrain: Mesh;
  detailed: boolean;
  colliders: StaticCollider[];
  lastSeen: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);

/** Street light parts (shared). */
let lampGeo: BufferGeometry | null = null;
let lampHeadGeo: BufferGeometry | null = null;
function lampGeometry() {
  if (lampGeo) return { pole: lampGeo, head: lampHeadGeo! };
  const pole = new CylinderGeometry(0.09, 0.14, 8.5, 6).translate(0, 4.25, 0);
  const arm = new BoxGeometry(0.1, 0.1, 2.4).translate(0, 8.4, -1.1);
  const housing = new BoxGeometry(0.45, 0.18, 0.9).translate(0, 8.3, -2.2);
  const parts = [pole, arm, housing].map((g) => {
    const ng = g.toNonIndexed();
    ng.deleteAttribute('uv');
    const n = ng.getAttribute('position').count;
    const c = new Float32Array(n * 3).fill(0.32);
    ng.setAttribute('color', new (ng.getAttribute('position').constructor as any)(c, 3));
    return ng;
  });
  lampGeo = mergeGeometries(parts)!;
  lampHeadGeo = new BoxGeometry(0.38, 0.06, 0.8).translate(0, 8.19, -2.2);
  return { pole: lampGeo, head: lampHeadGeo };
}

/**
 * The open world: physics queries, chunk streaming with LOD, and all static scenery.
 */
export class World implements PhysicsWorld {
  wetness = 0;
  readonly root = new Group();
  readonly structures: Structures;
  readonly ground: Ground;
  private chunks = new Map<number, Chunk>();
  private staticGrid = new Map<number, StaticCollider[]>();
  private terrainMat = terrainMaterial();
  private lampHeadMat = new MeshBasicMaterial({ color: 0xfff1d0 });
  private poolMat = new MeshBasicMaterial({ color: 0xffc98a, map: radialTexture(), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  private tunnelLightMat = new MeshBasicMaterial({ color: 0xffd9a0 });
  private neonMat = new MeshStandardMaterial({ color: 0x220000, emissive: 0xe01a2b, emissiveIntensity: 2.5 });
  private far: Mesh;
  private frame = 0;
  /** Chunk radius for detailed content (trees, props) and total radius (terrain + roads). */
  detailRadius = 2;
  viewRadius = 3;
  quality = 2;
  shadows = true;
  onBreak?: (id: number, speed: number) => void;
  /** Build stats */
  buildMs = 0;

  constructor(public readonly data: WorldData, scene: Scene) {
    this.structures = new Structures(data);
    this.ground = new Ground(data, this.structures);
    for (const c of this.structures.colliders) this.addStatic(c);
    scene.add(this.root);
    this.far = new Mesh(buildFarTerrain(data), this.terrainMat);
    this.far.receiveShadow = false;
    this.root.add(this.far);
    const sky = buildSkyline(this.structures);
    if (sky) {
      const m = new Mesh(sky, vcMaterial(0.7, 0.2));
      m.name = 'skyline';
      this.root.add(m);
    }
    this.root.add(buildSea());
    this.root.add(buildRiver(data));
  }

  private key(cx: number, cz: number) {
    return cz * 1000 + cx;
  }

  private addStatic(c: StaticCollider, list?: StaticCollider[]) {
    const r = c.kind === 'box' ? Math.hypot(c.hx, c.hz) : c.r;
    const cs = 64;
    for (let gx = Math.floor((c.x - r) / cs); gx <= Math.floor((c.x + r) / cs); gx++)
      for (let gz = Math.floor((c.z - r) / cs); gz <= Math.floor((c.z + r) / cs); gz++) {
        const k = (gx + 100) * 1000 + gz + 100;
        let arr = this.staticGrid.get(k);
        if (!arr) this.staticGrid.set(k, (arr = []));
        arr.push(c);
      }
    list?.push(c);
  }

  private removeStatic(list: StaticCollider[]) {
    const set = new Set(list);
    for (const [k, arr] of this.staticGrid) {
      const f = arr.filter((c) => !set.has(c));
      if (f.length !== arr.length) this.staticGrid.set(k, f);
    }
  }

  // ------------------------------------------------------------------ physics queries
  sampleGround(x: number, z: number, yRef: number, out: GroundHit): void {
    this.ground.wetness = this.wetness;
    this.ground.sampleGround(x, z, yRef, out);
  }

  queryStatic(x: number, z: number, radius: number, out: StaticCollider[]): void {
    const cs = 64;
    const seen = new Set<StaticCollider>();
    for (let gx = Math.floor((x - radius) / cs); gx <= Math.floor((x + radius) / cs); gx++)
      for (let gz = Math.floor((z - radius) / cs); gz <= Math.floor((z + radius) / cs); gz++) {
        const arr = this.staticGrid.get((gx + 100) * 1000 + gz + 100);
        if (!arr) continue;
        for (const c of arr) {
          if (seen.has(c)) continue;
          const cr = c.kind === 'box' ? Math.max(c.hx, c.hz) * 1.42 : c.r;
          if (Math.abs(c.x - x) < radius + cr && Math.abs(c.z - z) < radius + cr) {
            seen.add(c);
            out.push(c);
          }
        }
      }
  }

  barrierAt(x: number, y: number, z: number, out: Vector3): number {
    return this.ground.barrierAt(x, y, z, out);
  }

  // ------------------------------------------------------------------ streaming
  configure(quality: number, shadows: boolean) {
    this.quality = quality;
    this.shadows = shadows;
    this.viewRadius = [2, 2, 3, 3][quality] ?? 3;
    this.detailRadius = [1, 2, 2, 3][quality] ?? 2;
  }

  /** Stream chunks around a point; builds at most `budgetMs` of new content per call. */
  update(px: number, pz: number, budgetMs = 8, force = false) {
    this.frame++;
    const ccx = Math.floor((px + HALF) / CHUNK_SIZE), ccz = Math.floor((pz + HALF) / CHUNK_SIZE);
    const want: { cx: number; cz: number; d: number; lod: number }[] = [];
    const R = this.viewRadius;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        if (cx < 0 || cz < 0 || cx >= CHUNKS || cz >= CHUNKS) continue;
        // distance from player to chunk rect
        const x0 = cx * CHUNK_SIZE - HALF, z0 = cz * CHUNK_SIZE - HALF;
        const ex = Math.max(x0 - px, 0, px - (x0 + CHUNK_SIZE)), ez = Math.max(z0 - pz, 0, pz - (z0 + CHUNK_SIZE));
        const d = Math.hypot(ex, ez);
        if (d > R * CHUNK_SIZE) continue;
        const lod = d < 150 ? 0 : d < 420 ? 1 : 2;
        want.push({ cx, cz, d, lod: this.quality === 0 ? Math.max(1, lod) : lod });
      }
    want.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    for (const wnt of want) {
      const k = this.key(wnt.cx, wnt.cz);
      const ch = this.chunks.get(k);
      const detailed = wnt.d < this.detailRadius * CHUNK_SIZE * 0.8;
      if (ch) {
        ch.lastSeen = this.frame;
        if (ch.lod !== wnt.lod && (force || performance.now() - t0 < budgetMs)) {
          const geo = buildTerrainChunk(this.data, wnt.cx, wnt.cz, 1 << wnt.lod);
          ch.terrain.geometry.dispose();
          ch.terrain.geometry = geo;
          ch.lod = wnt.lod;
        }
        if (detailed && !ch.detailed && (force || performance.now() - t0 < budgetMs)) this.addDetail(ch);
        continue;
      }
      if (!force && performance.now() - t0 > budgetMs) continue;
      this.buildChunk(wnt.cx, wnt.cz, wnt.lod, detailed);
    }
    // unload chunks that fell out of range (with hysteresis)
    for (const [k, ch] of this.chunks) {
      if (this.frame - ch.lastSeen > 30) {
        this.disposeChunk(ch);
        this.chunks.delete(k);
      }
    }
    this.buildMs = performance.now() - t0;
  }

  private buildChunk(cx: number, cz: number, lod: number, detailed: boolean) {
    const group = new Group();
    const terrain = new Mesh(buildTerrainChunk(this.data, cx, cz, 1 << lod), this.terrainMat);
    terrain.receiveShadow = this.shadows;
    group.add(terrain);
    // roads & structures are always built (they define the drivable world)
    const rg = buildChunkRoads(this.data, cx, cz, this.quality);
    for (const [kind, g] of rg.roads) {
      const m = new Mesh(g, roadMaterial(kind as RoadKind));
      m.receiveShadow = this.shadows;
      group.add(m);
    }
    if (rg.structures) {
      const m = new Mesh(rg.structures, vcMaterial(0.85, 0.05, true));
      m.receiveShadow = this.shadows;
      m.castShadow = this.shadows;
      group.add(m);
    }
    if (rg.curbs) group.add(new Mesh(rg.curbs, vcMaterial(0.7, 0, true)));
    if (rg.tunnelLights) group.add(new Mesh(rg.tunnelLights, this.tunnelLightMat));
    if (rg.lights.length) {
      const { pole, head } = lampGeometry();
      const n = rg.lights.length / 4;
      const poles = new InstancedMesh(pole, vcMaterial(0.5, 0.6), n);
      const heads = new InstancedMesh(head, this.lampHeadMat, n);
      const pools = new InstancedMesh(new PlaneGeometry(16, 16).rotateX(-Math.PI / 2), this.poolMat, n);
      for (let i = 0; i < n; i++) {
        const [x, y, z, hd] = rg.lights.slice(i * 4, i * 4 + 4);
        _q.setFromAxisAngle(UP, hd);
        _m.compose(_v.set(x, y, z), _q, _s);
        poles.setMatrixAt(i, _m);
        heads.setMatrixAt(i, _m);
        // pool under the lamp head (2.2 m forward of the pole along -Z local)
        const fx = x - Math.sin(hd) * 2.2, fz = z - Math.cos(hd) * 2.2;
        _m.compose(_v.set(fx, y + 0.08, fz), _q, _s);
        pools.setMatrixAt(i, _m);
      }
      poles.castShadow = this.shadows && this.quality >= 2;
      for (const im of [poles, heads, pools]) {
        im.computeBoundingSphere();
        group.add(im);
      }
      pools.renderOrder = 3;
    }
    const sg = buildChunkStructures(this.structures, cx, cz, this.quality);
    sg.facades.forEach((g, style) => {
      if (!g) return;
      const m = new Mesh(g, facadeMaterial(style));
      m.castShadow = this.shadows;
      m.receiveShadow = this.shadows && this.quality >= 2;
      group.add(m);
    });
    if (sg.colored) {
      const m = new Mesh(sg.colored, vcMaterial(0.75, 0.1));
      m.castShadow = this.shadows;
      m.receiveShadow = this.shadows;
      group.add(m);
    }
    if (sg.sidewalks) {
      const m = new Mesh(sg.sidewalks, concreteMaterial());
      m.receiveShadow = this.shadows;
      group.add(m);
    }
    if (sg.neon) group.add(new Mesh(sg.neon, this.neonMat));
    const ch: Chunk = { box: new Box3().setFromObject(group), cx, cz, lod, group, terrain, detailed: false, colliders: [], lastSeen: this.frame };
    this.root.add(group);
    this.chunks.set(this.key(cx, cz), ch);
    if (detailed) this.addDetail(ch);
  }

  private addDetail(ch: Chunk) {
    ch.detailed = true;
    const density = [0.35, 0.6, 0.85, 1.0][this.quality] ?? 0.8;
    const trees = scatterChunk(this.data, ch.cx, ch.cz, density, this.structures.treeSpots);
    for (const im of buildTreeMeshes(trees, this.shadows && this.quality >= 2)) {
      im.userData.detail = true;
      ch.group.add(im);
    }
    for (const t of trees) {
      const r = t.type === 3 ? t.scale * 0.45 : t.type === 2 ? 0.35 : 0.3 + t.scale * 0.012;
      this.addStatic({ kind: 'circle', x: t.x, z: t.z, r, yMin: t.y - 1, yMax: t.y + 4 }, ch.colliders);
    }
  }

  private disposeChunk(ch: Chunk) {
    this.root.remove(ch.group);
    ch.group.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && !(o as InstancedMesh).isInstancedMesh) m.geometry.dispose();
      if ((o as InstancedMesh).isInstancedMesh) (o as InstancedMesh).dispose();
    });
    if (ch.colliders.length) this.removeStatic(ch.colliders);
  }

  readonly occlusion = new Occlusion();
  private occluders: { x: number; z: number; w: number; d: number; h: number; y: number; rot: number; tiers?: number }[] = [];

  /** Software occlusion culling of whole chunks behind large buildings (city only). */
  cull(camera: Camera) {
    const cam = camera.position;
    const oc = this.occlusion;
    const inCity = this.data.gen.cityMask(cam.x, cam.z) > 0.5 && cam.y < 60;
    if (!inCity || !oc.enabled) {
      for (const ch of this.chunks.values()) ch.group.visible = true;
      return;
    }
    if (!this.occluders.length) {
      for (const s of this.structures.list) if (s.kind === 'building' && s.h > 14) this.occluders.push({ x: s.x, z: s.z, w: s.w, d: s.d, h: s.h, y: s.y, rot: s.rot, tiers: s.tiers });
    }
    oc.begin(camera);
    const near = this.occluders
      .map((o) => [o, (o.x - cam.x) ** 2 + (o.z - cam.z) ** 2] as const)
      .filter(([, d2]) => d2 < 220 * 220)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 48);
    for (const [o] of near) oc.addBox(o.x, o.y, o.z, o.w / 2, (o.tiers ?? 1) > 1 ? o.h * 0.55 : o.h, o.d / 2, o.rot);
    const ccx = Math.floor((cam.x + HALF) / CHUNK_SIZE), ccz = Math.floor((cam.z + HALF) / CHUNK_SIZE);
    for (const ch of this.chunks.values()) {
      if (Math.abs(ch.cx - ccx) <= 0 && Math.abs(ch.cz - ccz) <= 0) {
        ch.group.visible = true;
        continue;
      }
      oc.apply(ch.group, ch.box);
    }
  }

  /** Night factor drives street lights and windows. */
  setNight(night: number) {
    WU.uNight.value = night;
    this.poolMat.opacity = clamp(night * 0.55, 0, 0.55);
    this.lampHeadMat.color.setRGB(0.4 + night * 1.6, 0.38 + night * 1.45, 0.32 + night * 1.1);
    this.neonMat.emissiveIntensity = 0.8 + night * 2.5;
  }

  setWetness(w: number) {
    this.wetness = w;
    WU.uWet.value = w;
  }

  get loadedChunks() {
    return this.chunks.size;
  }

  /** Is every chunk within radius built? (used by loading screen) */
  ready(px: number, pz: number): boolean {
    const ccx = Math.floor((px + HALF) / CHUNK_SIZE), ccz = Math.floor((pz + HALF) / CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.chunks.has(this.key(ccx + dx, ccz + dz)) && ccx + dx >= 0 && ccz + dz >= 0 && ccx + dx < CHUNKS && ccz + dz < CHUNKS) return false;
    return true;
  }

  /** Find a safe spawn on the nearest road to (x,z): returns position + heading. */
  spawnOnRoad(x: number, z: number): { x: number; y: number; z: number; heading: number } {
    let best: { x: number; y: number; z: number; heading: number; d: number } | null = null;
    for (const r of this.data.roads.roads) {
      if (r.def.kind === 'dirt' && best) continue;
      for (let i = 0; i < r.n; i += 3) {
        if (r.flags[i] & (RF.tunnel | RF.bridge)) continue;
        const d = Math.hypot(r.px[i] - x, r.pz[i] - z);
        if (!best || d < best.d) {
          const lane = r.laneOffset(0, 1);
          const rx = -r.tz[i], rz = r.tx[i];
          best = { x: r.px[i] + rx * lane, y: r.py[i], z: r.pz[i] + rz * lane, heading: Math.atan2(-r.tx[i], -r.tz[i]), d };
        }
      }
    }
    return best!;
  }
}

export { Color };
