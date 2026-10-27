import { Vector3 } from 'three';
import { Surface } from '../physics/Surface';
import { Heightmap } from './Heightmap';
import { RoadNetwork } from './RoadNetwork';
import { rectDist, TerrainGen } from './TerrainGen';
import { CITY, PORT, RIVER, ROADS } from './WorldDef';
import { checksum } from '../save/SaveSystem';
import { loadWorldCache, saveWorldCache } from '../save/WorldCache';

/** Bump when the terrain/road generation code changes to invalidate cached islands. */
export const WORLD_VERSION = 'island-9';

export interface WorldData {
  gen: TerrainGen;
  hm: Heightmap;
  roads: RoadNetwork;
}

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Deterministic island generation: natural terrain -> road profiles -> road flattening -> biomes.
 * Async with progress so the loading screen stays responsive on phones.
 */
export async function generateWorld(onProgress: (p: number, label: string) => void = () => {}, useCache = false): Promise<WorldData> {
  const gen = new TerrainGen();
  const hm = new Heightmap();
  const key = WORLD_VERSION + ':' + checksum(JSON.stringify([ROADS, RIVER]));
  if (useCache) {
    const c = await loadWorldCache(key);
    if (c && c.h.length === hm.h.length && c.roads.length === ROADS.length) {
      onProgress(0.5, 'roads');
      hm.h.set(c.h);
      hm.surf.set(c.surf);
      const roads = new RoadNetwork(ROADS);
      roads.findJunctions();
      roads.roads.forEach((r, i) => {
        if (c.roads[i].py.length === r.n) {
          r.py = c.roads[i].py;
          r.flags = c.roads[i].flags;
        }
      });
      roads.buildIndex();
      onProgress(1, 'done');
      console.info('[MotorWorld] island loaded from cache');
      return { gen, hm, roads };
    }
  }
  const n = hm.n;
  let t = performance.now();
  for (let j = 0; j < n; j++) {
    const z = hm.wz(j);
    for (let i = 0; i < n; i++) hm.h[j * n + i] = gen.natural(hm.wx(i), z);
    if (performance.now() - t > 30) {
      onProgress((j / n) * 0.6, 'terrain');
      await yieldFrame();
      t = performance.now();
    }
  }
  onProgress(0.62, 'roads');
  await yieldFrame();
  const roads = new RoadNetwork(ROADS);
  roads.buildProfiles(gen, (x, z) => hm.heightAt(x, z));
  onProgress(0.72, 'roads');
  await yieldFrame();
  roads.flattenTerrain(hm);
  roads.buildRails(hm);
  roads.buildIndex();
  onProgress(0.85, 'biomes');
  await yieldFrame();
  computeSurfaces(gen, hm);
  onProgress(1, 'done');
  if (useCache) void saveWorldCache({ key, h: hm.h, surf: hm.surf, roads: roads.roads.map((r) => ({ py: r.py, flags: r.flags })) });
  return { gen, hm, roads };
}

function computeSurfaces(gen: TerrainGen, hm: Heightmap) {
  const n = hm.n;
  const nrm = new Vector3();
  for (let j = 0; j < n; j++) {
    const z = hm.wz(j);
    for (let i = 0; i < n; i++) {
      const x = hm.wx(i);
      const h = hm.h[j * n + i];
      hm.smoothNormal(i, j, nrm);
      let s: Surface = Surface.Grass;
      const inCity = rectDist(x, z, CITY.x0 - 12, CITY.z0 - 12, CITY.x1 + 12, CITY.z1 + 12) === 0;
      const inPort = rectDist(x, z, PORT.x0 - 20, PORT.z0 - 20, PORT.x1 + 40, PORT.z1 + 40) === 0;
      if (inCity || inPort) s = Surface.Concrete;
      else if (h < 3.2) s = Surface.Sand;
      else if (nrm.y < 0.78) s = Surface.Rock;
      else if (h > 230 && gen.n2.noise(x / 60, z / 60) > -0.2) s = Surface.Rock;
      else if (gen.forestMask(x, z) > 0.5 && gen.n2.noise(x / 90, z / 90) > 0.1) s = Surface.Dirt;
      else if (gen.n3.noise(x / 160, z / 160) > 0.55 && gen.mountainMask(x, z) < 0.2) s = Surface.Dirt;
      hm.surf[j * n + i] = s;
    }
  }
}
