/** Ground surface types and their physical/audio/visual properties. */
export const enum Surface {
  Asphalt = 0,
  Concrete = 1,
  Gravel = 2,
  Dirt = 3,
  Grass = 4,
  Sand = 5,
  Curb = 6,
  Rock = 7,
}

export interface SurfaceInfo {
  name: string;
  /** Base friction coefficient for a street tire. */
  grip: number;
  /** Rolling resistance coefficient. */
  rollRes: number;
  /** Physics bumpiness amplitude (m). */
  bump: number;
  /** Grip retained when sliding (0..1). Loose surfaces keep more grip past the peak. */
  slideFalloff: number;
  /** Whether wheels throw dust/debris. */
  dusty: boolean;
  /** Tire audio family. */
  sound: 'tarmac' | 'loose' | 'soft';
  dustColor: number;
  /** Responds to rain wetness (sealed surfaces get slippery, loose ones get muddy). */
  wetFactor: number;
}

export const SURFACES: SurfaceInfo[] = [
  { name: 'asphalt', grip: 1.0, rollRes: 0.012, bump: 0.0, slideFalloff: 0.72, dusty: false, sound: 'tarmac', dustColor: 0x9a9a9a, wetFactor: 0.74 },
  { name: 'concrete', grip: 0.96, rollRes: 0.012, bump: 0.0, slideFalloff: 0.72, dusty: false, sound: 'tarmac', dustColor: 0xb0aca4, wetFactor: 0.76 },
  { name: 'gravel', grip: 0.66, rollRes: 0.03, bump: 0.02, slideFalloff: 0.9, dusty: true, sound: 'loose', dustColor: 0xb59c7a, wetFactor: 0.9 },
  { name: 'dirt', grip: 0.62, rollRes: 0.035, bump: 0.03, slideFalloff: 0.88, dusty: true, sound: 'loose', dustColor: 0x8a6a48, wetFactor: 0.8 },
  { name: 'grass', grip: 0.52, rollRes: 0.05, bump: 0.025, slideFalloff: 0.85, dusty: true, sound: 'soft', dustColor: 0x5e6b3a, wetFactor: 0.78 },
  { name: 'sand', grip: 0.45, rollRes: 0.12, bump: 0.02, slideFalloff: 0.92, dusty: true, sound: 'soft', dustColor: 0xd8c49a, wetFactor: 1.0 },
  { name: 'curb', grip: 0.9, rollRes: 0.015, bump: 0.015, slideFalloff: 0.7, dusty: false, sound: 'tarmac', dustColor: 0x999999, wetFactor: 0.65 },
  { name: 'rock', grip: 0.7, rollRes: 0.03, bump: 0.05, slideFalloff: 0.8, dusty: true, sound: 'loose', dustColor: 0x8c8780, wetFactor: 0.75 },
];

export type TireCompound = 'street' | 'sport' | 'semislick' | 'slick' | 'offroad' | 'drift';

/** Per-compound multiplier against each surface (indexed by Surface). */
export const COMPOUND_GRIP: Record<TireCompound, number[]> = {
  //            asph  conc  grav  dirt  grass sand  curb  rock
  street:     [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  sport:      [1.1, 1.1, 0.95, 0.95, 0.95, 0.95, 1.08, 0.95],
  semislick:  [1.2, 1.18, 0.85, 0.85, 0.85, 0.85, 1.15, 0.85],
  slick:      [1.32, 1.3, 0.72, 0.72, 0.75, 0.75, 1.25, 0.75],
  offroad:    [0.9, 0.92, 1.35, 1.38, 1.3, 1.45, 0.9, 1.3],
  drift:      [0.86, 0.86, 0.9, 0.9, 0.9, 0.9, 0.86, 0.9],
};

/** How badly each compound suffers in the wet (1 = unaffected). */
export const COMPOUND_WET: Record<TireCompound, number> = {
  street: 1.0,
  sport: 0.97,
  semislick: 0.9,
  slick: 0.72,
  offroad: 1.0,
  drift: 0.95,
};
