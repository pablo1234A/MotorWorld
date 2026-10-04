// Layer recipes, top → bottom. Only ingredients confirmed on Flanagan's
// published menu are used for the named burgers. `anatomia` is the hero
// "anatomy" build that shows every classic layer.
import { BUILDERS as B } from './ingredients.js';

const L = (label, build, opts) => ({ label, build, opts });

export const RECIPES = {
  anatomia: [
    L('Pan brioche', B.bunTop, { seed: 1 }),
    L('Salsa de la casa', B.sauce, { seed: 21, color: 0xe7823a }),
    L('Lechuga', B.lettuce, { seed: 7 }),
    L('Tomate', B.tomato, { seed: 9 }),
    L('Queso cheddar', B.cheeseSlice, { seed: 5, rotation: 0.5 }),
    L('Carne a la brasa', B.patty, { seed: 3, height: 0.28 }),
    L('Bacon crujiente', B.baconStrips, { seed: 12 }),
    L('Pan brioche', B.bunBottom, { seed: 2 }),
  ],

  // Triple carne de 100 g, doble queso y salsa cheddar.
  smash: [
    L('Pan brioche', B.bunTop, { seed: 31, height: 0.58 }),
    L('Salsa cheddar', B.sauce, { seed: 32, color: 0xf1a01c, drips: 11 }),
    L('Carne smash 100 g', B.patty, { kind: 'smash', seed: 33, height: 0.12, radius: 1.12, lace: 0.14 }),
    L('Queso', B.cheeseSlice, { seed: 34, rotation: 0.2, drapeFrom: 1.02 }),
    L('Carne smash 100 g', B.patty, { kind: 'smash', seed: 35, height: 0.12, radius: 1.1, lace: 0.14 }),
    L('Queso', B.cheeseSlice, { seed: 36, rotation: 1.1, drapeFrom: 1.02 }),
    L('Carne smash 100 g', B.patty, { kind: 'smash', seed: 37, height: 0.12, radius: 1.12, lace: 0.14 }),
    L('Pan brioche', B.bunBottom, { seed: 38, height: 0.3 }),
  ],

  // 180 g de carne, queso de cabra, bacon y cebolla caramelizada.
  mostoles: [
    L('Pan brioche', B.bunTop, { seed: 41 }),
    L('Cebolla caramelizada', B.caramelizedOnion, { seed: 42 }),
    L('Queso de cabra', B.goatCheese, { seed: 43 }),
    L('Bacon', B.baconStrips, { seed: 44 }),
    L('Carne 180 g', B.patty, { seed: 45, height: 0.32, radius: 1.06 }),
    L('Pan brioche', B.bunBottom, { seed: 46 }),
  ],

  pulledpork: [
    L('Pan brioche', B.bunTop, { seed: 51 }),
    L('Pulled pork', B.pulledPork, { seed: 52 }),
    L('Pan brioche', B.bunBottom, { seed: 53 }),
  ],

  // Beyond Burger, mezclum, tomate, cebolla, calabacín y salsa romesco.
  vegan: [
    L('Pan brioche', B.bunTop, { seed: 61 }),
    L('Salsa romesco', B.sauce, { seed: 62, color: 0xc0471c }),
    L('Mezclum', B.mixedGreens, { seed: 63 }),
    L('Tomate', B.tomato, { seed: 64 }),
    L('Cebolla', B.onionRings, { seed: 65 }),
    L('Calabacín', B.zucchini, { seed: 66 }),
    L('Beyond Burger', B.patty, { kind: 'plant', seed: 67, height: 0.26 }),
    L('Pan brioche', B.bunBottom, { seed: 68 }),
  ],
};

export function buildLayers(key) {
  const recipe = RECIPES[key] || RECIPES.anatomia;
  return recipe.map(({ label, build, opts }) => ({ label, ...build(opts) }));
}
