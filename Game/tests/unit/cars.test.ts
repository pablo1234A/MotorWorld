import { describe, expect, it } from 'vitest';
import { CARS } from '../../src/vehicles/CarCatalog';
import { computeStats } from '../../src/vehicles/Performance';
import { PARTS, resolveSpec, type PartLevels } from '../../src/vehicles/Tuning';

const maxed: PartLevels = Object.fromEntries(PARTS.filter((p) => p.slot !== 'compound').map((p) => [p.slot, 3]));

describe('car catalog', () => {
  it('every car has sane stock stats and upgrades improve performance', () => {
    const rows: string[] = [];
    for (const def of CARS) {
      const stock = computeStats(resolveSpec(def, {}));
      const up = computeStats(resolveSpec(def, { ...maxed, compound: 2 }));
      rows.push(`${def.id.padEnd(18)} ${def.spec.drivetrain.layout} hp ${stock.hp.toFixed(0).padStart(4)} top ${stock.topSpeed.toFixed(0).padStart(3)} 0-100 ${stock.zeroTo100.toFixed(2).padStart(5)} br ${stock.braking.toFixed(1)} g ${stock.lateralG.toFixed(2)} PI ${stock.pi} ${stock.cls}  ->  hp ${up.hp.toFixed(0)} top ${up.topSpeed.toFixed(0)} 0-100 ${up.zeroTo100.toFixed(2)} g ${up.lateralG.toFixed(2)} PI ${up.pi} ${up.cls}`);
      expect(stock.hp).toBeGreaterThan(150);
      expect(stock.zeroTo100).toBeLessThan(12);
      expect(stock.topSpeed).toBeGreaterThan(170);
      expect(up.pi).toBeGreaterThan(stock.pi);
      expect(up.hp).toBeGreaterThan(stock.hp);
    }
    console.log('\n' + rows.join('\n'));
  });
});
