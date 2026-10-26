import { it } from 'vitest';
import { TerrainGen } from '../src/world/TerrainGen';
import { ROADS } from '../src/world/WorldDef';
it('probe', () => {
  const g = new TerrainGen();
  const pass = ROADS.find(r => r.id === 'pass')!;
  console.log(pass.pts.map(p => `${p}:${g.natural(p[0], p[1]).toFixed(0)}`).join('  '));
  // coarse map of mountain region heights
  let out = '';
  for (let z = -2000; z <= -200; z += 100) {
    let row = (z + '').padStart(6) + ' ';
    for (let x = -2000; x <= 0; x += 100) row += g.natural(x, z).toFixed(0).padStart(4);
    out += row + '\n';
  }
  console.log('      ' + Array.from({length: 21}, (_, i) => (-2000 + i * 100).toString().padStart(4)).join('').slice(0));
  console.log(out);
});
