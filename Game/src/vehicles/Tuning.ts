import type { CarSpec } from '../physics/CarSpec';
import type { TireCompound } from '../physics/Surface';
import { clamp } from '../core/MathUtil';
import type { CarDef } from './CarCatalog';

export type PartSlot =
  | 'intake' | 'exhaust' | 'turbo' | 'intercooler' | 'ecu' | 'fuel' | 'camshaft' | 'internals'
  | 'gearbox' | 'clutch' | 'diff'
  | 'springs' | 'dampers' | 'antiroll' | 'weight'
  | 'discs' | 'calipers'
  | 'compound' | 'tireWidth'
  | 'splitter' | 'wing' | 'diffuser'
  | 'nitro';

export type PartGroup = 'engine' | 'drivetrain' | 'chassis' | 'brakes' | 'tires' | 'aero' | 'nitro';

export interface PartInfo {
  slot: PartSlot;
  group: PartGroup;
  name: { es: string; en: string };
  /** Display names per level (index 0 = stock). */
  levels: { es: string; en: string }[];
  baseCost: number;
}

const L = (es: string, en: string) => ({ es, en });
const STD = [L('Serie', 'Stock'), L('Calle', 'Street'), L('Sport', 'Sport'), L('Competición', 'Race')];

export const PARTS: PartInfo[] = [
  { slot: 'intake', group: 'engine', name: L('Admisión', 'Intake'), levels: STD, baseCost: 900 },
  { slot: 'exhaust', group: 'engine', name: L('Escape', 'Exhaust'), levels: STD, baseCost: 1400 },
  { slot: 'turbo', group: 'engine', name: L('Turbo', 'Turbo'), levels: [L('Serie', 'Stock'), L('Turbo pequeño', 'Small turbo'), L('Turbo grande', 'Big turbo'), L('Biturbo de carreras', 'Race twin-turbo')], baseCost: 4200 },
  { slot: 'intercooler', group: 'engine', name: L('Intercooler', 'Intercooler'), levels: STD, baseCost: 1100 },
  { slot: 'ecu', group: 'engine', name: L('Centralita (ECU)', 'ECU'), levels: STD, baseCost: 1300 },
  { slot: 'fuel', group: 'engine', name: L('Combustible', 'Fuel system'), levels: STD, baseCost: 800 },
  { slot: 'camshaft', group: 'engine', name: L('Árbol de levas', 'Camshaft'), levels: STD, baseCost: 1800 },
  { slot: 'internals', group: 'engine', name: L('Pistones y bielas', 'Pistons & rods'), levels: STD, baseCost: 3200 },
  { slot: 'gearbox', group: 'drivetrain', name: L('Caja de cambios', 'Gearbox'), levels: [L('Serie', 'Stock'), L('Relaciones cerradas', 'Close ratio'), L('Secuencial sport', 'Sport sequential'), L('Secuencial de carreras', 'Race sequential')], baseCost: 2600 },
  { slot: 'clutch', group: 'drivetrain', name: L('Embrague', 'Clutch'), levels: STD, baseCost: 900 },
  { slot: 'diff', group: 'drivetrain', name: L('Diferencial', 'Differential'), levels: [L('Serie', 'Stock'), L('Autoblocante calle', 'Street LSD'), L('Autoblocante sport', 'Sport LSD'), L('Autoblocante competición', 'Race LSD')], baseCost: 1700 },
  { slot: 'springs', group: 'chassis', name: L('Muelles', 'Springs'), levels: STD, baseCost: 1000 },
  { slot: 'dampers', group: 'chassis', name: L('Amortiguadores', 'Dampers'), levels: STD, baseCost: 1200 },
  { slot: 'antiroll', group: 'chassis', name: L('Barras estabilizadoras', 'Anti-roll bars'), levels: STD, baseCost: 700 },
  { slot: 'weight', group: 'chassis', name: L('Aligeramiento', 'Weight reduction'), levels: STD, baseCost: 2400 },
  { slot: 'discs', group: 'brakes', name: L('Discos', 'Brake discs'), levels: STD, baseCost: 1100 },
  { slot: 'calipers', group: 'brakes', name: L('Pinzas', 'Calipers'), levels: STD, baseCost: 1300 },
  { slot: 'compound', group: 'tires', name: L('Compuesto', 'Compound'), levels: [L('Serie', 'Stock'), L('Deportivo', 'Sport'), L('Semi-slick', 'Semi-slick'), L('Slick', 'Slick'), L('Todoterreno', 'Off-road'), L('Drift', 'Drift')], baseCost: 1000 },
  { slot: 'tireWidth', group: 'tires', name: L('Anchura', 'Tire width'), levels: [L('Serie', 'Stock'), L('+10 mm', '+10 mm'), L('+20 mm', '+20 mm'), L('+30 mm', '+30 mm')], baseCost: 600 },
  { slot: 'splitter', group: 'aero', name: L('Splitter delantero', 'Front splitter'), levels: STD, baseCost: 1200 },
  { slot: 'wing', group: 'aero', name: L('Alerón', 'Rear wing'), levels: [L('Serie', 'Stock'), L('Labio', 'Lip'), L('Alerón sport', 'Sport wing'), L('Alerón GT', 'GT wing')], baseCost: 1500 },
  { slot: 'diffuser', group: 'aero', name: L('Difusor', 'Diffuser'), levels: STD, baseCost: 1100 },
  { slot: 'nitro', group: 'nitro', name: L('Nitro', 'Nitrous'), levels: [L('Sin nitro', 'None'), L('Kit 25%', 'Kit 25%'), L('Kit 35%', 'Kit 35%'), L('Kit 50%', 'Kit 50%')], baseCost: 3500 },
];

export const COMPOUND_BY_LEVEL: (TireCompound | null)[] = [null, 'sport', 'semislick', 'slick', 'offroad', 'drift'];

export type PartLevels = Partial<Record<PartSlot, number>>;

/** Fine-tuning values (only applied when the corresponding race part is installed). */
export interface FineTune {
  finalDrive: number; // multiplier
  diffLock: number; // 0..1 rear lsd lock
  awdSplit: number; // front share
  brakeBias: number;
  springF: number; // multiplier
  springR: number;
  rideHeight: number; // meters offset
  arbF: number;
  arbR: number;
  damping: number;
  aeroF: number;
  aeroR: number;
  boost: number;
}

export const DEFAULT_TUNE: FineTune = {
  finalDrive: 1, diffLock: 0.5, awdSplit: 0.4, brakeBias: 0.62, springF: 1, springR: 1, rideHeight: 0, arbF: 1, arbR: 1, damping: 1, aeroF: 1, aeroR: 1, boost: 1,
};

export interface TuneSlider {
  key: keyof FineTune;
  label: { es: string; en: string };
  min: number;
  max: number;
  step: number;
  requires: [PartSlot, number];
  fmt: (v: number) => string;
  awdOnly?: boolean;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
export const TUNE_SLIDERS: TuneSlider[] = [
  { key: 'finalDrive', label: L('Grupo final', 'Final drive'), min: 0.8, max: 1.2, step: 0.01, requires: ['gearbox', 3], fmt: (v) => v.toFixed(2) + 'x' },
  { key: 'diffLock', label: L('Bloqueo diferencial', 'Diff lock'), min: 0.1, max: 0.95, step: 0.05, requires: ['diff', 3], fmt: pct },
  { key: 'awdSplit', label: L('Reparto delantero (AWD)', 'Front torque (AWD)'), min: 0.2, max: 0.6, step: 0.02, requires: ['diff', 3], fmt: pct, awdOnly: true },
  { key: 'brakeBias', label: L('Reparto de frenada', 'Brake bias'), min: 0.5, max: 0.75, step: 0.01, requires: ['calipers', 3], fmt: pct },
  { key: 'springF', label: L('Muelles delanteros', 'Front springs'), min: 0.7, max: 1.5, step: 0.05, requires: ['springs', 3], fmt: pct },
  { key: 'springR', label: L('Muelles traseros', 'Rear springs'), min: 0.7, max: 1.5, step: 0.05, requires: ['springs', 3], fmt: pct },
  { key: 'rideHeight', label: L('Altura', 'Ride height'), min: -0.06, max: 0.04, step: 0.005, requires: ['springs', 2], fmt: (v) => `${Math.round(v * 1000)} mm` },
  { key: 'arbF', label: L('Estabilizadora del.', 'Front anti-roll'), min: 0.5, max: 2, step: 0.05, requires: ['antiroll', 3], fmt: pct },
  { key: 'arbR', label: L('Estabilizadora tras.', 'Rear anti-roll'), min: 0.5, max: 2, step: 0.05, requires: ['antiroll', 3], fmt: pct },
  { key: 'damping', label: L('Amortiguación', 'Damping'), min: 0.7, max: 1.5, step: 0.05, requires: ['dampers', 3], fmt: pct },
  { key: 'aeroF', label: L('Carga aerodinámica del.', 'Front downforce'), min: 0.5, max: 1.5, step: 0.05, requires: ['splitter', 3], fmt: pct },
  { key: 'aeroR', label: L('Carga aerodinámica tras.', 'Rear downforce'), min: 0.5, max: 1.5, step: 0.05, requires: ['wing', 3], fmt: pct },
  { key: 'boost', label: L('Presión de turbo', 'Boost pressure'), min: 0.8, max: 1.25, step: 0.01, requires: ['turbo', 3], fmt: pct },
];

export type Finish = 'gloss' | 'metallic' | 'matte' | 'pearl' | 'chrome' | 'satin';

export interface VisualConfig {
  color: number;
  finish: Finish;
  rimStyle: number;
  rimColor: number;
  rimSize: number;
  vinyl: number;
  vinylColor: number;
  vinylColor2: number;
  raceNumber: number;
  tint: number;
  caliperColor: number;
  underglow: number;
  frontBumper: number;
  rearBumper: number;
  skirts: number;
  hood: number;
  mirrors: number;
  lights: number;
}

export function defaultVisual(def: CarDef): VisualConfig {
  return {
    color: def.color, finish: 'metallic', rimStyle: ['petra_hot', 'halden_vektor'].includes(def.id) ? 4 : def.category === 'offroad' ? 6 : def.category === 'classic' ? 5 : def.category === 'jdm' ? 2 : 0,
    rimColor: def.category === 'classic' ? 0xd8d8d8 : 0x9aa0a6, rimSize: 0, vinyl: 0, vinylColor: 0xffffff, vinylColor2: 0x111111, raceNumber: 7,
    tint: 1, caliperColor: def.category === 'super' || def.category === 'hyper' ? 0xd6a400 : 0x8a8a8a, underglow: 0, frontBumper: 0, rearBumper: 0, skirts: 0, hood: 0, mirrors: 0, lights: 0,
  };
}

export const VISUAL_PRICES = {
  paint: 600, finish: 900, rims: 1800, rimColor: 300, vinyl: 1200, tint: 250, caliper: 300, underglow: 1500, frontBumper: 2200, rearBumper: 1900, skirts: 1400, hood: 1600, lights: 500,
};

export const VINYLS = [L('Ninguno', 'None'), L('Franjas racing', 'Racing stripes'), L('Franja lateral', 'Side stripe'), L('Dos tonos', 'Two-tone'), L('Dorsal de carreras', 'Race livery'), L('Llamas', 'Flames'), L('Camuflaje digital', 'Digital camo'), L('Degradado', 'Fade'), L('Carbono', 'Carbon')];
export const RIM_NAMES = ['Apex 5', 'Fifteen', 'Mesh RS', 'Aero Disc', 'Split Six', 'Classic Deep', 'Trail Bead', 'Y-Spoke'];

/** Cost multiplier based on the car's value. */
export function carCostFactor(def: CarDef): number {
  return clamp(Math.pow(def.price / 50000, 0.42), 0.7, 4.2);
}

export function partPrice(def: CarDef, slot: PartSlot, level: number): number {
  const p = PARTS.find((x) => x.slot === slot)!;
  if (level <= 0) return 0;
  const mult = slot === 'compound' ? [0, 1, 2, 3.2, 1.6, 1.4][level] : [0, 1, 2.4, 4.6][level];
  return Math.round((p.baseCost * mult * carCostFactor(def)) / 50) * 50;
}

/** Can this part be installed on this car? */
export function partAvailable(def: CarDef, slot: PartSlot): boolean {
  if (slot === 'intercooler' && !def.spec.engine.turbo) return true; // usable after turbo kit
  if (def.spec.engine.electricAssist > 0 && slot === 'turbo') return false;
  return true;
}

/**
 * Resolve the effective physical specification of a car from its stock spec, installed parts and fine tuning.
 * Every performance part maps to concrete physical parameters.
 */
export function resolveSpec(def: CarDef, parts: PartLevels, tune: FineTune = DEFAULT_TUNE): CarSpec {
  const s: CarSpec = structuredClone(def.spec);
  const lv = (k: PartSlot) => parts[k] ?? 0;
  const e = s.engine;

  // ---------------- Engine ----------------
  let torqueMul = 1;
  torqueMul *= 1 + [0, 0.015, 0.03, 0.045][lv('intake')];
  torqueMul *= 1 + [0, 0.02, 0.035, 0.055][lv('exhaust')];
  torqueMul *= 1 + [0, 0.02, 0.035, 0.05][lv('ecu')];
  torqueMul *= 1 + [0, 0.01, 0.02, 0.03][lv('fuel')];
  torqueMul *= 1 + [0, 0.01, 0.02, 0.035][lv('internals')];
  e.redline += [0, 200, 400, 650][lv('ecu')] * (e.redline > 8500 ? 0.4 : 1);
  e.redline += [0, 250, 550, 900][lv('internals')] * (e.redline > 8500 ? 0.4 : 1);
  e.revRate *= 1 + [0, 0.08, 0.16, 0.28][lv('internals')];
  const cam = lv('camshaft');
  e.torqueRpm += [0, 200, 400, 700][cam];
  e.plateauRpm += [0, 300, 600, 1000][cam];
  e.redline += [0, 150, 300, 500][cam];
  e.lowEndFrac -= [0, 0.02, 0.04, 0.07][cam];
  torqueMul *= 1 + [0, 0.015, 0.03, 0.045][cam];
  e.plateauRpm = Math.min(e.plateauRpm, e.redline - 300);
  e.torqueRpm = Math.min(e.torqueRpm, e.plateauRpm);

  const tl = lv('turbo');
  if (tl > 0) {
    if (!e.turbo) {
      // Turbo kit on a naturally aspirated engine
      const boost = [0, 0.3, 0.55, 0.8][tl];
      e.turbo = { maxBoost: boost, spoolRpm: e.idleRpm + (e.redline - e.idleRpm) * [0, 0.38, 0.45, 0.52][tl], spoolRate: [0, 2.2, 1.8, 1.5][tl], gainPerBar: 0.55, twin: tl === 3 };
      // spec peak torque for NA engine means base torque: keep base by scaling peak accordingly
      e.peakTorque *= 1 + boost * 0.55;
    } else {
      const add = [0, 0.15, 0.3, 0.5][tl];
      const base = e.peakTorque / (1 + e.turbo.maxBoost * e.turbo.gainPerBar);
      e.turbo.maxBoost += add;
      e.turbo.spoolRpm *= 1 + [0, 0.05, 0.1, 0.16][tl];
      e.turbo.spoolRate *= [1, 0.95, 0.88, 0.8][tl];
      if (tl === 3) e.turbo.twin = true;
      e.peakTorque = base * (1 + e.turbo.maxBoost * e.turbo.gainPerBar);
    }
    if (tl === 3) e.turbo.maxBoost *= tune.boost;
  }
  if (e.turbo) {
    const ic = lv('intercooler');
    e.turbo.gainPerBar *= 1 + [0, 0.03, 0.06, 0.09][ic];
    // keep peak torque consistent with base after gain change
    const base = def.spec.engine.turbo ? def.spec.engine.peakTorque / (1 + def.spec.engine.turbo.maxBoost * def.spec.engine.turbo.gainPerBar) : def.spec.engine.peakTorque;
    e.peakTorque = base * (1 + e.turbo.maxBoost * e.turbo.gainPerBar);
  }
  e.peakTorque *= torqueMul;
  e.engineBrake *= 1 + [0, 0.05, 0.1, 0.15][lv('exhaust')];

  // ---------------- Drivetrain ----------------
  const d = s.drivetrain;
  const gb = lv('gearbox');
  if (gb > 0) {
    // Close the ratios towards a geometric progression between first and top
    const n = d.gears.length;
    const first = d.gears[0] * [1, 0.97, 0.94, 0.9][gb];
    const top = d.gears[n - 1] * [1, 1.0, 1.02, 1.05][gb];
    const closeness = [0, 0.35, 0.6, 0.85][gb];
    for (let i = 0; i < n; i++) {
      const geo = first * Math.pow(top / first, i / (n - 1));
      d.gears[i] = d.gears[i] + (geo - d.gears[i]) * closeness;
    }
    d.shiftTime *= [1, 0.85, 0.6, 0.4][gb];
  }
  if (gb >= 3) d.finalDrive *= tune.finalDrive;
  d.shiftTime *= [1, 0.9, 0.8, 0.7][lv('clutch')];
  d.efficiency += [0, 0.01, 0.02, 0.03][lv('clutch')];
  const dl = lv('diff');
  if (dl > 0) {
    const lock = dl >= 3 ? tune.diffLock : [0, 0.25, 0.4, 0.6][dl];
    const preload = [0, 40, 80, 120][dl];
    if (d.rearDiff.type !== 'locked') d.rearDiff = { type: 'lsd', lock: Math.max(d.rearDiff.lock, lock), preload };
    if (dl >= 3) d.rearDiff.lock = lock;
    if (d.layout !== 'RWD' && d.frontDiff.type !== 'locked') d.frontDiff = { type: 'lsd', lock: lock * 0.6, preload: preload * 0.5 };
    if (dl >= 3 && d.layout === 'AWD') d.frontSplit = tune.awdSplit;
  }

  // ---------------- Chassis ----------------
  const su = s.suspension;
  const sp = lv('springs');
  const springMul = [1, 1.15, 1.3, 1.5][sp];
  su.springFront *= springMul * (sp >= 3 ? tune.springF : 1);
  su.springRear *= springMul * (sp >= 3 ? tune.springR : 1);
  su.rideOffset = [0, -0.015, -0.03, -0.04][sp];
  if (sp >= 2) su.rideOffset = clamp(su.rideOffset + tune.rideHeight, -0.08, 0.06);
  su.travel *= [1, 0.95, 0.9, 0.85][sp];
  const dm = lv('dampers');
  const dampMul = [1, 1.15, 1.3, 1.45][dm] * (dm >= 3 ? tune.damping : 1);
  su.damperBump *= dampMul;
  su.damperRebound *= dampMul;
  const ar = lv('antiroll');
  const arbMul = [1, 1.2, 1.4, 1.7][ar];
  su.arbFront *= arbMul * (ar >= 3 ? tune.arbF : 1);
  su.arbRear *= arbMul * (ar >= 3 ? tune.arbR : 1);
  const wr = lv('weight');
  const ch = s.chassis;
  ch.mass *= 1 - [0, 0.03, 0.06, 0.1][wr];
  ch.mass -= [0, 3, 6, 10][lv('exhaust')];
  ch.cgHeight *= 1 - [0, 0.01, 0.02, 0.035][wr];
  ch.cgHeight += su.rideOffset * 0.6;

  // ---------------- Brakes ----------------
  const b = s.brakes;
  b.maxTorque *= 1 + [0, 0.12, 0.25, 0.4][lv('discs')];
  b.maxTorque *= 1 + [0, 0.08, 0.16, 0.25][lv('calipers')];
  if (lv('calipers') >= 3) b.bias = tune.brakeBias;

  // ---------------- Tires ----------------
  const t = s.tires;
  const comp = COMPOUND_BY_LEVEL[lv('compound')];
  if (comp) t.compound = comp;
  const tw = [0, 10, 20, 30][lv('tireWidth')];
  t.widthFront += tw;
  t.widthRear += tw;

  // ---------------- Aero ----------------
  const a = s.aero;
  const spl = lv('splitter');
  a.clFront += [0, 0.08, 0.15, 0.24][spl] * (spl >= 3 ? tune.aeroF : 1);
  a.cd += [0, 0.004, 0.008, 0.012][spl];
  const wg = lv('wing');
  a.clRear += [0, 0.1, 0.22, 0.38][wg] * (wg >= 3 ? tune.aeroR : 1);
  a.cd += [0, 0.006, 0.015, 0.03][wg];
  a.clRear += [0, 0.05, 0.1, 0.15][lv('diffuser')];

  // ---------------- Nitro ----------------
  const ni = lv('nitro');
  if (ni > 0) s.nitro = [0, 0.25, 0.35, 0.5][ni];
  return s;
}
