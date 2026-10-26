import type { CarSpec, DiffType, DriveLayout } from '../physics/CarSpec';
import type { TireCompound } from '../physics/Surface';
import type { BodyStyle } from './BodyStyle';

export type CarCategory = 'hatch' | 'sedan' | 'jdm' | 'muscle' | 'euro' | 'super' | 'hyper' | 'suv' | 'offroad' | 'classic';

export interface EngineSound {
  /** Firing character. */
  firing: 'even' | 'crossplane' | 'flat' | 'v12' | 'inline6';
  /** 0..1 exhaust rasp / harmonic richness */
  rasp: number;
  /** 0..1 low-frequency rumble */
  rumble: number;
  /** Exhaust resonator length factor (higher = deeper). */
  pipe: number;
  whistle: number;
}

export interface CarDef {
  id: string;
  brand: string;
  model: string;
  year: number;
  category: CarCategory;
  price: number;
  unlockLevel: number;
  desc: { es: string; en: string };
  spec: CarSpec;
  body: BodyStyle;
  sound: EngineSound;
  color: number;
  /** Visible in dealership. */
  dealer: boolean;
  engineLabel: string;
}

interface Q {
  mass: number; wf: number; cg: number;
  idle: number; red: number; torque: number; tRpm: number; plat: number; rFrac: number; low: number;
  cyl: number; layout: 'I' | 'V' | 'F' | 'W' | 'R';
  turbo?: [number, number, number, boolean?];
  electric?: number;
  drive: DriveLayout; split?: number;
  gears: number[]; final: number; shift: number; rev?: number;
  rDiff: [DiffType, number, number]; fDiff?: [DiffType, number, number];
  spring: [number, number]; damp: [number, number]; arb: [number, number]; travel: number;
  tires: [number, number]; compound?: TireCompound; grip?: [number, number];
  brake: number; bias: number; hb?: number;
  cd: number; area: number; cl: [number, number];
  steer?: number; nitro?: number;
}

function spec(q: Q, b: BodyStyle): CarSpec {
  return {
    engine: {
      idleRpm: q.idle, redline: q.red, peakTorque: q.torque, torqueRpm: q.tRpm, plateauRpm: q.plat, redlineFrac: q.rFrac, lowEndFrac: q.low,
      engineBrake: q.torque * 0.16, revRate: 7000 + (q.red - 6000) * 1.2, cylinders: q.cyl, layout: q.layout,
      turbo: q.turbo ? { maxBoost: q.turbo[0], spoolRpm: q.turbo[1], spoolRate: q.turbo[2], gainPerBar: 0.55, twin: !!q.turbo[3] } : null,
      electricAssist: q.electric ?? 0,
    },
    drivetrain: {
      layout: q.drive, frontSplit: q.split ?? 0.4, gears: q.gears, reverse: q.rev ?? 3.3, finalDrive: q.final, shiftTime: q.shift, efficiency: 0.88,
      frontDiff: { type: (q.fDiff ?? ['open', 0, 0])[0], lock: (q.fDiff ?? ['open', 0, 0])[1], preload: (q.fDiff ?? ['open', 0, 0])[2] },
      rearDiff: { type: q.rDiff[0], lock: q.rDiff[1], preload: q.rDiff[2] },
    },
    chassis: {
      mass: q.mass, cgHeight: q.cg, weightFront: q.wf, wheelbase: b.wheelbase, trackFront: b.trackF, trackRear: b.trackR,
      length: b.length, width: b.width, height: b.roofH,
    },
    suspension: {
      travel: q.travel, springFront: q.spring[0], springRear: q.spring[1], damperBump: q.damp[0], damperRebound: q.damp[1],
      arbFront: q.arb[0], arbRear: q.arb[1], rideOffset: 0,
    },
    tires: { radius: b.wheelRadius, widthFront: q.tires[0], widthRear: q.tires[1], compound: q.compound ?? 'street', gripFront: q.grip?.[0] ?? 1, gripRear: q.grip?.[1] ?? 1 },
    brakes: { maxTorque: q.brake, bias: q.bias, handbrake: q.hb ?? 2600 },
    aero: { cd: q.cd, frontalArea: q.area, clFront: q.cl[0], clRear: q.cl[1] },
    steering: { maxAngle: q.steer ?? 0.58, rate: 2.6 },
    nitro: q.nitro ?? 0,
  };
}

function car(d: Omit<CarDef, 'spec'> & { q: Q }): CarDef {
  const { q, ...rest } = d;
  return { ...rest, spec: spec(q, d.body) };
}

// --------------------------------------------------------------------------------------------
// Original vehicles. Brands, names and designs are fictional.
// --------------------------------------------------------------------------------------------

export const CARS: CarDef[] = [
  car({
    id: 'petra_hot', brand: 'Petra', model: 'Hot 2.0T', year: 2024, category: 'hatch', price: 26000, unlockLevel: 1, dealer: true,
    engineLabel: '2.0 I4 Turbo', color: 0xe01a2b,
    desc: { es: 'Compacto deportivo ligero y juguetón. Tracción delantera y turbo con mucha patada.', en: 'Light, playful hot hatch. Front-wheel drive and a punchy turbo.' },
    sound: { firing: 'even', rasp: 0.55, rumble: 0.2, pipe: 0.8, whistle: 0.7 },
    body: {
      kind: 'hatch', length: 4.15, width: 1.8, frontAxle: 0.86, wheelbase: 2.6, clearance: 0.14, wheelRadius: 0.32, tireWidthF: 0.235, tireWidthR: 0.235,
      trackF: 1.54, trackR: 1.52, noseH: 0.62, hoodH: 0.92, cowlT: 0.3, roofT0: 0.47, roofT1: 0.8, roofH: 1.44, deckT: 0.95, deckH: 1.08, tailH: 0.98,
      beltH: 1.0, roofW: 0.82, noseTaper: 0.14, tailTaper: 0.08, flare: 0.03, roundness: 0.6, bPillar: 0.45,
      headlight: 'slim', taillight: 'split', grille: 'wide', scoop: false, sideIntake: false, exhaust: { count: 2, spread: 0.12, style: 'center' }, stockWing: 1,
    },
    q: {
      mass: 1290, wf: 0.61, cg: 0.5, idle: 850, red: 6800, torque: 370, tRpm: 2000, plat: 4800, rFrac: 0.62, low: 0.45, cyl: 4, layout: 'I', turbo: [1.2, 2600, 2.4],
      drive: 'FWD', gears: [3.62, 2.19, 1.52, 1.16, 0.92, 0.78], final: 3.9, shift: 0.28, rDiff: ['open', 0, 0], fDiff: ['lsd', 0.2, 30],
      spring: [42000, 36000], damp: [3600, 4600], arb: [22000, 14000], travel: 0.2, tires: [235, 235], brake: 7800, bias: 0.68,
      cd: 0.32, area: 2.2, cl: [0.05, 0.08],
    },
  }),
  car({
    id: 'kensei_raiden', brand: 'Kensei', model: 'Raiden RS', year: 2001, category: 'jdm', price: 58000, unlockLevel: 2, dealer: true,
    engineLabel: '2.6 I6 Twin-Turbo', color: 0x2b55c8,
    desc: { es: 'Leyenda japonesa de seis en línea biturbo y tracción total inteligente. Responde como un bisturí.', en: 'Japanese legend: twin-turbo straight six with smart AWD. Scalpel-sharp.' },
    sound: { firing: 'inline6', rasp: 0.6, rumble: 0.3, pipe: 0.9, whistle: 1.0 },
    body: {
      kind: 'coupe', length: 4.6, width: 1.79, frontAxle: 0.92, wheelbase: 2.67, clearance: 0.13, wheelRadius: 0.33, tireWidthF: 0.245, tireWidthR: 0.245,
      trackF: 1.48, trackR: 1.49, noseH: 0.58, hoodH: 0.86, cowlT: 0.34, roofT0: 0.5, roofT1: 0.72, roofH: 1.36, deckT: 0.86, deckH: 0.98, tailH: 0.95,
      beltH: 0.95, roofW: 0.8, noseTaper: 0.12, tailTaper: 0.06, flare: 0.04, roundness: 0.35, bPillar: 0.55, cPillar: 0.4,
      headlight: 'wide', taillight: 'round', grille: 'mesh', scoop: false, sideIntake: false, exhaust: { count: 1, spread: 0, style: 'round' }, stockWing: 2,
    },
    q: {
      mass: 1540, wf: 0.56, cg: 0.48, idle: 900, red: 8000, torque: 392, tRpm: 4400, plat: 5800, rFrac: 0.7, low: 0.4, cyl: 6, layout: 'I', turbo: [0.9, 3600, 1.6, true],
      drive: 'AWD', split: 0.32, gears: [3.83, 2.36, 1.69, 1.31, 1.0, 0.79], final: 3.55, shift: 0.24, rDiff: ['lsd', 0.4, 60], fDiff: ['lsd', 0.15, 20],
      spring: [56000, 50000], damp: [4400, 5600], arb: [26000, 18000], travel: 0.19, tires: [245, 245], brake: 9200, bias: 0.64,
      cd: 0.34, area: 2.0, cl: [0.08, 0.14],
    },
  }),
  car({
    id: 'halden_vektor', brand: 'Halden', model: 'Vektor S', year: 2023, category: 'sedan', price: 74000, unlockLevel: 3, dealer: true,
    engineLabel: '3.0 I6 Twin-Turbo', color: 0x1d2a33,
    desc: { es: 'Berlina de cuatro puertas con alma de deportivo. Seis en línea biturbo y propulsión trasera.', en: 'Four-door sedan with a sports car soul. Twin-turbo six and rear drive.' },
    sound: { firing: 'inline6', rasp: 0.45, rumble: 0.35, pipe: 1.0, whistle: 0.6 },
    body: {
      kind: 'sedan', length: 4.85, width: 1.9, frontAxle: 0.9, wheelbase: 2.86, clearance: 0.13, wheelRadius: 0.34, tireWidthF: 0.255, tireWidthR: 0.275,
      trackF: 1.6, trackR: 1.62, noseH: 0.64, hoodH: 0.95, cowlT: 0.31, roofT0: 0.45, roofT1: 0.7, roofH: 1.44, deckT: 0.83, deckH: 1.04, tailH: 1.0,
      beltH: 1.01, roofW: 0.8, noseTaper: 0.1, tailTaper: 0.06, flare: 0.03, roundness: 0.45, bPillar: 0.48, cPillar: 0.4,
      headlight: 'led', taillight: 'wide', grille: 'split', scoop: false, sideIntake: false, exhaust: { count: 4, spread: 0.6, style: 'round' }, stockWing: 1,
    },
    q: {
      mass: 1720, wf: 0.52, cg: 0.5, idle: 750, red: 7200, torque: 600, tRpm: 2500, plat: 5600, rFrac: 0.7, low: 0.45, cyl: 6, layout: 'I', turbo: [1.1, 2400, 2.2, true],
      drive: 'RWD', gears: [5.0, 3.2, 2.14, 1.72, 1.31, 1.0, 0.82, 0.64], final: 3.15, shift: 0.16, rDiff: ['lsd', 0.35, 60],
      spring: [52000, 56000], damp: [4400, 5800], arb: [26000, 18000], travel: 0.18, tires: [255, 275], brake: 10500, bias: 0.62,
      cd: 0.31, area: 2.3, cl: [0.06, 0.08],
    },
  }),
  car({
    id: 'brannock_thunder', brand: 'Brannock', model: 'Thunder V8', year: 2020, category: 'muscle', price: 56000, unlockLevel: 2, dealer: true,
    engineLabel: '6.4 V8', color: 0xf2a516,
    desc: { es: 'Muscle car de la vieja escuela: V8 atmosférico enorme, mucho par y ganas de humo.', en: 'Old-school muscle: a huge naturally aspirated V8, endless torque and a love for smoke.' },
    sound: { firing: 'crossplane', rasp: 0.5, rumble: 1.0, pipe: 1.3, whistle: 0 },
    body: {
      kind: 'muscle', length: 5.0, width: 1.95, frontAxle: 0.98, wheelbase: 2.95, clearance: 0.13, wheelRadius: 0.35, tireWidthF: 0.255, tireWidthR: 0.285,
      trackF: 1.63, trackR: 1.65, noseH: 0.78, hoodH: 1.0, cowlT: 0.4, roofT0: 0.53, roofT1: 0.7, roofH: 1.35, deckT: 0.86, deckH: 1.04, tailH: 1.0,
      beltH: 1.04, roofW: 0.76, noseTaper: 0.05, tailTaper: 0.03, flare: 0.04, roundness: 0.2, bPillar: 0.0,
      headlight: 'quad', taillight: 'bar', grille: 'wide', scoop: true, sideIntake: false, exhaust: { count: 2, spread: 0.85, style: 'square' }, stockWing: 1,
    },
    q: {
      mass: 1780, wf: 0.55, cg: 0.52, idle: 700, red: 6400, torque: 640, tRpm: 4300, plat: 4800, rFrac: 0.78, low: 0.62, cyl: 8, layout: 'V',
      drive: 'RWD', gears: [2.97, 2.07, 1.43, 1.0, 0.71, 0.57], final: 3.73, shift: 0.3, rDiff: ['lsd', 0.3, 40],
      spring: [48000, 44000], damp: [3800, 5000], arb: [24000, 12000], travel: 0.2, tires: [255, 285], brake: 9500, bias: 0.62,
      cd: 0.38, area: 2.35, cl: [0.0, 0.04],
    },
  }),
  car({
    id: 'wessel_kurve', brand: 'Wessel', model: 'Kurve 9', year: 2022, category: 'euro', price: 128000, unlockLevel: 5, dealer: true,
    engineLabel: '4.0 Flat-6', color: 0xd9dde2,
    desc: { es: 'Deportivo europeo de motor trasero bóxer atmosférico. Tracción brutal y un sonido metálico que sube hasta 9.000 rpm.', en: 'European rear-engined boxer. Huge traction and a metallic howl to 9,000 rpm.' },
    sound: { firing: 'flat', rasp: 0.85, rumble: 0.3, pipe: 0.75, whistle: 0 },
    body: {
      kind: 'rear', length: 4.55, width: 1.85, frontAxle: 0.95, wheelbase: 2.46, clearance: 0.11, wheelRadius: 0.34, tireWidthF: 0.255, tireWidthR: 0.305,
      trackF: 1.58, trackR: 1.56, noseH: 0.55, hoodH: 0.82, cowlT: 0.36, roofT0: 0.52, roofT1: 0.62, roofH: 1.28, deckT: 0.97, deckH: 0.98, tailH: 0.95,
      beltH: 0.9, roofW: 0.72, noseTaper: 0.2, tailTaper: 0.1, flare: 0.07, roundness: 0.85, bPillar: 0.0,
      headlight: 'round', taillight: 'bar', grille: 'small', scoop: false, sideIntake: true, exhaust: { count: 2, spread: 0.2, style: 'center' }, stockWing: 2,
    },
    q: {
      mass: 1450, wf: 0.39, cg: 0.45, idle: 900, red: 9000, torque: 465, tRpm: 6100, plat: 6800, rFrac: 0.84, low: 0.5, cyl: 6, layout: 'F',
      drive: 'RWD', gears: [3.75, 2.38, 1.72, 1.34, 1.11, 0.96, 0.84], final: 3.97, shift: 0.1, rDiff: ['lsd', 0.45, 80],
      spring: [62000, 82000], damp: [4800, 6400], arb: [30000, 24000], travel: 0.16, tires: [255, 305], brake: 11500, bias: 0.6,
      cd: 0.33, area: 1.95, cl: [0.12, 0.3],
    },
  }),
  car({
    id: 'volta_strale', brand: 'Volta', model: 'Strale V8', year: 2025, category: 'super', price: 285000, unlockLevel: 8, dealer: true,
    engineLabel: '4.0 V8 Twin-Turbo', color: 0xc8102e,
    desc: { es: 'Superdeportivo de motor central. V8 biturbo de cigüeñal plano, chasis de carbono y aerodinámica activa.', en: 'Mid-engined supercar. Flat-plane twin-turbo V8, carbon tub and active aero.' },
    sound: { firing: 'even', rasp: 0.9, rumble: 0.45, pipe: 0.7, whistle: 0.8 },
    body: {
      kind: 'mid', length: 4.6, width: 1.98, frontAxle: 1.05, wheelbase: 2.65, clearance: 0.1, wheelRadius: 0.35, tireWidthF: 0.265, tireWidthR: 0.325,
      trackF: 1.68, trackR: 1.64, noseH: 0.42, hoodH: 0.75, cowlT: 0.28, roofT0: 0.45, roofT1: 0.58, roofH: 1.18, deckT: 0.9, deckH: 0.98, tailH: 0.95,
      beltH: 0.86, roofW: 0.62, noseTaper: 0.22, tailTaper: 0.06, flare: 0.08, roundness: 0.7, bPillar: 0.0,
      headlight: 'slim', taillight: 'wide', grille: 'none', scoop: false, sideIntake: true, exhaust: { count: 2, spread: 0.25, style: 'round' }, stockWing: 1,
    },
    q: {
      mass: 1430, wf: 0.42, cg: 0.42, idle: 1000, red: 8200, torque: 770, tRpm: 3200, plat: 6300, rFrac: 0.78, low: 0.42, cyl: 8, layout: 'V', turbo: [1.3, 3000, 2.6, true],
      drive: 'RWD', gears: [3.13, 2.19, 1.68, 1.35, 1.12, 0.94, 0.79], final: 3.4, shift: 0.07, rDiff: ['lsd', 0.5, 100],
      spring: [80000, 92000], damp: [5600, 7200], arb: [34000, 26000], travel: 0.14, tires: [265, 325], grip: [1.05, 1.08], compound: 'sport', brake: 14000, bias: 0.6,
      cd: 0.34, area: 1.9, cl: [0.25, 0.42],
    },
  }),
  car({
    id: 'aurion_zenith', brand: 'Aurion', model: 'Zenith', year: 2026, category: 'hyper', price: 1850000, unlockLevel: 15, dealer: true,
    engineLabel: '6.5 V12 Hybrid', color: 0x101418,
    desc: { es: 'Hiperdeportivo híbrido: V12 atmosférico y motores eléctricos delanteros. Más de 1.100 CV con tracción total vectorial.', en: 'Hybrid hypercar: naturally aspirated V12 plus front e-motors. 1,100+ hp with vectoring AWD.' },
    sound: { firing: 'v12', rasp: 0.95, rumble: 0.4, pipe: 0.6, whistle: 0 },
    body: {
      kind: 'hyper', length: 4.75, width: 2.05, frontAxle: 1.1, wheelbase: 2.72, clearance: 0.09, wheelRadius: 0.36, tireWidthF: 0.285, tireWidthR: 0.345,
      trackF: 1.72, trackR: 1.68, noseH: 0.38, hoodH: 0.7, cowlT: 0.27, roofT0: 0.44, roofT1: 0.56, roofH: 1.14, deckT: 0.93, deckH: 1.0, tailH: 0.98,
      beltH: 0.8, roofW: 0.56, noseTaper: 0.24, tailTaper: 0.04, flare: 0.1, roundness: 0.8, bPillar: 0.0,
      headlight: 'led', taillight: 'bar', grille: 'none', scoop: true, sideIntake: true, exhaust: { count: 2, spread: 0.12, style: 'center' }, stockWing: 3,
    },
    q: {
      mass: 1560, wf: 0.44, cg: 0.4, idle: 1100, red: 9200, torque: 980, tRpm: 5600, plat: 7200, rFrac: 0.82, low: 0.55, cyl: 12, layout: 'V', electric: 0.45,
      drive: 'AWD', split: 0.35, gears: [3.0, 2.15, 1.7, 1.4, 1.17, 0.99, 0.84], final: 3.3, shift: 0.05, rDiff: ['lsd', 0.55, 120], fDiff: ['lsd', 0.3, 40],
      spring: [92000, 105000], damp: [6200, 8000], arb: [38000, 30000], travel: 0.12, tires: [285, 345], compound: 'semislick', brake: 17500, bias: 0.6,
      cd: 0.36, area: 1.85, cl: [0.42, 0.7], nitro: 0,
    },
  }),
  car({
    id: 'ardent_volcan', brand: 'Ardent', model: 'Volcan S', year: 2024, category: 'suv', price: 142000, unlockLevel: 6, dealer: true,
    engineLabel: '4.0 V8 Twin-Turbo', color: 0x3e4a3d,
    desc: { es: 'SUV deportivo que desafía la física: 2,1 toneladas que aceleran como un superdeportivo.', en: 'A physics-defying sport SUV: 2.1 tonnes that launch like a supercar.' },
    sound: { firing: 'crossplane', rasp: 0.5, rumble: 0.8, pipe: 1.1, whistle: 0.6 },
    body: {
      kind: 'suv', length: 5.0, width: 2.0, frontAxle: 0.98, wheelbase: 3.0, clearance: 0.2, wheelRadius: 0.38, tireWidthF: 0.285, tireWidthR: 0.315,
      trackF: 1.7, trackR: 1.7, noseH: 0.9, hoodH: 1.15, cowlT: 0.3, roofT0: 0.42, roofT1: 0.86, roofH: 1.68, deckT: 0.97, deckH: 1.28, tailH: 1.2,
      beltH: 1.2, roofW: 0.84, noseTaper: 0.08, tailTaper: 0.05, flare: 0.04, roundness: 0.35, bPillar: 0.38, cPillar: 0.0,
      headlight: 'led', taillight: 'wide', grille: 'tall', scoop: false, sideIntake: false, exhaust: { count: 4, spread: 0.7, style: 'square' }, stockWing: 0, roofRack: true,
    },
    q: {
      mass: 2150, wf: 0.54, cg: 0.66, idle: 700, red: 6800, torque: 800, tRpm: 2200, plat: 4500, rFrac: 0.7, low: 0.5, cyl: 8, layout: 'V', turbo: [1.2, 2200, 2.2, true],
      drive: 'AWD', split: 0.4, gears: [4.71, 3.14, 2.11, 1.67, 1.29, 1.0, 0.84, 0.67], final: 3.2, shift: 0.15, rDiff: ['lsd', 0.4, 80], fDiff: ['open', 0, 0],
      spring: [62000, 66000], damp: [5000, 6400], arb: [36000, 28000], travel: 0.22, tires: [285, 315], brake: 14000, bias: 0.62,
      cd: 0.36, area: 2.8, cl: [0.0, 0.03],
    },
  }),
  car({
    id: 'ridgeback_trail', brand: 'Ridgeback', model: 'Trail 4x4', year: 2019, category: 'offroad', price: 44000, unlockLevel: 2, dealer: true,
    engineLabel: '3.5 V6', color: 0x8a5a2b,
    desc: { es: 'Todoterreno puro con diferenciales bloqueables y neumáticos de tacos. Donde acaba el asfalto, empieza su terreno.', en: 'Pure off-roader with locking diffs and knobbly tires. Where the asphalt ends, its playground begins.' },
    sound: { firing: 'even', rasp: 0.35, rumble: 0.6, pipe: 1.2, whistle: 0 },
    body: {
      kind: 'offroad', length: 4.5, width: 1.95, frontAxle: 0.82, wheelbase: 2.75, clearance: 0.3, wheelRadius: 0.42, tireWidthF: 0.3, tireWidthR: 0.3,
      trackF: 1.66, trackR: 1.66, noseH: 1.05, hoodH: 1.25, cowlT: 0.3, roofT0: 0.36, roofT1: 0.92, roofH: 1.92, deckT: 0.98, deckH: 1.7, tailH: 1.6,
      beltH: 1.36, roofW: 0.92, noseTaper: 0.03, tailTaper: 0.02, flare: 0.08, roundness: 0.1, bPillar: 0.3, cPillar: 0.0,
      headlight: 'round', taillight: 'vertical', grille: 'tall', scoop: false, sideIntake: false, exhaust: { count: 1, spread: 0, style: 'round' }, stockWing: 0, spare: true, roofRack: true,
    },
    q: {
      mass: 2100, wf: 0.53, cg: 0.75, idle: 700, red: 6200, torque: 390, tRpm: 4200, plat: 4800, rFrac: 0.8, low: 0.6, cyl: 6, layout: 'V',
      drive: 'AWD', split: 0.5, gears: [4.7, 2.84, 1.84, 1.38, 1.0, 0.79], final: 4.1, shift: 0.3, rDiff: ['locked', 1, 0], fDiff: ['lsd', 0.5, 60],
      spring: [42000, 44000], damp: [4200, 5200], arb: [14000, 9000], travel: 0.3, tires: [300, 300], compound: 'offroad', brake: 10000, bias: 0.6,
      cd: 0.48, area: 3.1, cl: [0, 0], steer: 0.62,
    },
  }),
  car({
    id: 'aldano_classica', brand: 'Aldano', model: 'Classica 67', year: 1967, category: 'classic', price: 96000, unlockLevel: 4, dealer: true,
    engineLabel: '3.0 I6 Carburado', color: 0x0f5c48,
    desc: { es: 'Gran turismo clásico de los sesenta: cromados, carburadores y una conducción viva y exigente.', en: 'A sixties grand tourer: chrome, carburettors and a lively, demanding drive.' },
    sound: { firing: 'inline6', rasp: 0.7, rumble: 0.45, pipe: 1.05, whistle: 0 },
    body: {
      kind: 'classic', length: 4.45, width: 1.7, frontAxle: 0.9, wheelbase: 2.5, clearance: 0.15, wheelRadius: 0.33, tireWidthF: 0.195, tireWidthR: 0.205,
      trackF: 1.4, trackR: 1.42, noseH: 0.7, hoodH: 0.86, cowlT: 0.42, roofT0: 0.54, roofT1: 0.7, roofH: 1.28, deckT: 0.9, deckH: 0.9, tailH: 0.86,
      beltH: 0.9, roofW: 0.76, noseTaper: 0.26, tailTaper: 0.16, flare: 0.05, roundness: 0.9, bPillar: 0.0,
      headlight: 'round', taillight: 'round', grille: 'chrome', scoop: false, sideIntake: false, exhaust: { count: 2, spread: 0.1, style: 'round' }, stockWing: 0, chromeBumpers: true,
    },
    q: {
      mass: 1180, wf: 0.52, cg: 0.5, idle: 800, red: 6300, torque: 280, tRpm: 4600, plat: 5000, rFrac: 0.8, low: 0.55, cyl: 6, layout: 'I',
      drive: 'RWD', gears: [3.3, 1.94, 1.31, 1.0, 0.84], final: 3.54, shift: 0.38, rDiff: ['open', 0, 0],
      spring: [32000, 30000], damp: [2800, 3400], arb: [12000, 6000], travel: 0.22, tires: [195, 205], grip: [0.92, 0.92], brake: 6200, bias: 0.6,
      cd: 0.38, area: 1.85, cl: [-0.03, -0.02], steer: 0.55,
    },
  }),
];

/** Traffic / police body styles (not purchasable). */
export const TRAFFIC_BODIES: { id: string; body: BodyStyle; weight: number; colors: number[] }[] = [
  {
    id: 'sedan', weight: 4, colors: [0xbfc4c8, 0x23272b, 0x6f7a84, 0x7a1d1d, 0x1f3550, 0xe8e6e0, 0x3b4a3a],
    body: { ...CARS[2].body, kind: 'sedan', roundness: 0.5, headlight: 'wide', exhaust: { count: 1, spread: 0, style: 'round' }, stockWing: 0, wheelRadius: 0.32, length: 4.7, width: 1.82, trackF: 1.56, trackR: 1.56, clearance: 0.15 },
  },
  {
    id: 'hatch', weight: 3, colors: [0xd23c3c, 0xf0f0ec, 0x3c64a0, 0x2a2a2a, 0x98a0a6, 0x5f8a4e],
    body: { ...CARS[0].body, roundness: 0.75, exhaust: { count: 1, spread: 0, style: 'round' }, stockWing: 0, wheelRadius: 0.3, headlight: 'wide', grille: 'small', length: 4.0, width: 1.74, roofH: 1.48 },
  },
  {
    id: 'suv', weight: 2, colors: [0x2b2f33, 0xd8d8d2, 0x56606a, 0x6b3b22],
    body: { ...CARS[7].body, roofRack: false, wheelRadius: 0.36, exhaust: { count: 1, spread: 0, style: 'round' }, grille: 'wide' },
  },
  {
    id: 'van', weight: 1.4, colors: [0xf2f2f0, 0xe6e6e6, 0x2f4f8f, 0xc8b030],
    body: {
      kind: 'van', length: 5.2, width: 2.0, frontAxle: 0.95, wheelbase: 3.3, clearance: 0.18, wheelRadius: 0.35, tireWidthF: 0.225, tireWidthR: 0.225,
      trackF: 1.72, trackR: 1.72, noseH: 0.95, hoodH: 1.2, cowlT: 0.16, roofT0: 0.27, roofT1: 0.98, roofH: 2.35, deckT: 0.995, deckH: 2.3, tailH: 2.25,
      beltH: 1.25, roofW: 0.95, noseTaper: 0.06, tailTaper: 0.0, flare: 0.0, roundness: 0.15, bPillar: 0.06, cPillar: 0.0,
      headlight: 'square', taillight: 'vertical', grille: 'wide', scoop: false, sideIntake: false, exhaust: { count: 1, spread: 0, style: 'round' }, stockWing: 0,
    },
  },
  {
    id: 'pickup', weight: 1.2, colors: [0x8a1c1c, 0x1a1a1a, 0xdedede, 0x2e4d6b],
    body: {
      kind: 'pickup', length: 5.6, width: 2.0, frontAxle: 0.95, wheelbase: 3.5, clearance: 0.24, wheelRadius: 0.4, tireWidthF: 0.275, tireWidthR: 0.275,
      trackF: 1.72, trackR: 1.72, noseH: 1.05, hoodH: 1.3, cowlT: 0.27, roofT0: 0.36, roofT1: 0.55, roofH: 1.92, deckT: 0.58, deckH: 1.32, tailH: 1.3,
      beltH: 1.36, roofW: 0.9, noseTaper: 0.04, tailTaper: 0.0, flare: 0.05, roundness: 0.15, bPillar: 0.5, cPillar: 0.0, bedT: 0.6,
      headlight: 'square', taillight: 'vertical', grille: 'tall', scoop: false, sideIntake: false, exhaust: { count: 1, spread: 0, style: 'round' }, stockWing: 0,
    },
  },
  {
    id: 'taxi', weight: 1, colors: [0xf2c200],
    body: { ...CARS[2].body, kind: 'sedan', roundness: 0.5, headlight: 'wide', exhaust: { count: 1, spread: 0, style: 'round' }, stockWing: 0, wheelRadius: 0.32, length: 4.7, width: 1.82, clearance: 0.15 },
  },
  {
    id: 'truck', weight: 0.8, colors: [0xf4f4f4, 0x2b4f86, 0xb02a2a, 0x2f6b3a],
    body: {
      kind: 'truck', length: 7.8, width: 2.4, frontAxle: 1.2, wheelbase: 4.8, clearance: 0.35, wheelRadius: 0.5, tireWidthF: 0.3, tireWidthR: 0.3,
      trackF: 2.0, trackR: 2.0, noseH: 1.2, hoodH: 1.5, cowlT: 0.04, roofT0: 0.08, roofT1: 0.26, roofH: 2.9, deckT: 0.28, deckH: 3.4, tailH: 3.4,
      beltH: 1.7, roofW: 0.95, noseTaper: 0.0, tailTaper: 0.0, flare: 0.0, roundness: 0.05, bPillar: 0.0, cPillar: 0.0,
      headlight: 'square', taillight: 'vertical', grille: 'tall', scoop: false, sideIntake: false, exhaust: { count: 1, spread: 0, style: 'round' }, stockWing: 0,
    },
  },
  {
    id: 'bus', weight: 0.5, colors: [0xd9412b, 0x2a6fd1],
    body: {
      kind: 'bus', length: 11.5, width: 2.5, frontAxle: 2.4, wheelbase: 6.2, clearance: 0.3, wheelRadius: 0.5, tireWidthF: 0.3, tireWidthR: 0.3,
      trackF: 2.1, trackR: 2.1, noseH: 1.2, hoodH: 1.3, cowlT: 0.01, roofT0: 0.04, roofT1: 0.99, roofH: 3.1, deckT: 0.995, deckH: 3.05, tailH: 3.0,
      beltH: 1.25, roofW: 0.97, noseTaper: 0.0, tailTaper: 0.0, flare: 0.0, roundness: 0.08, bPillar: 0.0, cPillar: 0.0,
      headlight: 'square', taillight: 'vertical', grille: 'none', scoop: false, sideIntake: false, exhaust: { count: 1, spread: 0, style: 'round' }, stockWing: 0,
    },
  },
];

export const POLICE_BODY: BodyStyle = { ...CARS[2].body, kind: 'sedan', lightBar: true, stockWing: 0 };

export function getCar(id: string): CarDef {
  const c = CARS.find((c) => c.id === id);
  if (!c) throw new Error('Unknown car ' + id);
  return c;
}

export const STARTER_CAR = 'petra_hot';
