/** Parameters that drive the procedural car body generator (meters, t = fraction of length from the nose). */
export interface BodyStyle {
  kind: 'hatch' | 'sedan' | 'coupe' | 'muscle' | 'rear' | 'mid' | 'hyper' | 'suv' | 'offroad' | 'classic' | 'van' | 'pickup' | 'bus' | 'truck';
  length: number;
  width: number;
  /** Distance from the nose to the front axle. */
  frontAxle: number;
  wheelbase: number;
  clearance: number;
  wheelRadius: number;
  tireWidthF: number;
  tireWidthR: number;
  trackF: number;
  trackR: number;
  noseH: number;
  hoodH: number;
  cowlT: number;
  roofT0: number;
  roofT1: number;
  roofH: number;
  deckT: number;
  deckH: number;
  tailH: number;
  beltH: number;
  /** Roof half-width as a fraction of body half-width (tumblehome). */
  roofW: number;
  noseTaper: number;
  tailTaper: number;
  flare: number;
  /** 0 = boxy, 1 = very rounded */
  roundness: number;
  /** Position of the B-pillar along the roof (0..1 between roofT0 and roofT1); 0 = none */
  bPillar: number;
  /** Extra C-pillar for sedans (fraction between roofT1 and deckT); 0 = none */
  cPillar?: number;
  headlight: 'slim' | 'round' | 'quad' | 'wide' | 'led' | 'square';
  taillight: 'bar' | 'round' | 'split' | 'wide' | 'vertical';
  grille: 'wide' | 'split' | 'mesh' | 'small' | 'none' | 'chrome' | 'tall';
  scoop: boolean;
  sideIntake: boolean;
  exhaust: { count: number; spread: number; style: 'round' | 'square' | 'center' };
  stockWing: 0 | 1 | 2 | 3;
  chromeBumpers?: boolean;
  spare?: boolean;
  roofRack?: boolean;
  bedT?: number;
  /** Visual-only: show a light bar (police). */
  lightBar?: boolean;
}
