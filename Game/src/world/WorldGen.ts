import { Vector3 } from 'three';
import { Surface } from '../physics/Surface';
import { Heightmap } from './Heightmap';
import { RoadNetwork } from './RoadNetwork';
import { TerrainGen } from './TerrainGen';
import { ROADS } from './WorldDef';

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
export async function generateWorld(onProgress: (p: number, label: string) => void = () => {}): Promise<WorldData> {
  const gen = new TerrainGen();
  const hm = new Heightmap();
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
      const cm = Math.max(gen.cityMask(x, z), gen.portMask(x, z));
      if (cm > 0.85) s = Surface.Concrete;
      else if (h < 3.2) s = Surface.Sand;
      else if (nrm.y < 0.78) s = Surface.Rock;
      else if (h > 230 && gen.n2.noise(x / 60, z / 60) > -0.2) s = Surface.Rock;
      else if (gen.forestMask(x, z) > 0.5 && gen.n2.noise(x / 90, z / 90) > 0.1) s = Surface.Dirt;
      else if (gen.n3.noise(x / 160, z / 160) > 0.55 && gen.mountainMask(x, z) < 0.2) s = Surface.Dirt;
      hm.surf[j * n + i] = s;
    }
  }
}
