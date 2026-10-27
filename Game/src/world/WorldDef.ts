import { Surface } from '../physics/Surface';

/** World extents: square map centred at the origin. +X = east, +Z = south. */
export const WORLD_SIZE = 4096;
export const HALF = WORLD_SIZE / 2;
export const GRID_RES = 4; // heightmap cell size (m)
export const CHUNK_SIZE = 256;
export const CHUNKS = WORLD_SIZE / CHUNK_SIZE;
export const SEA_LEVEL = 0;
export const CITY_Y = 8;
export const PORT_Y = 5;

export type RoadKind = 'highway' | 'boulevard' | 'street' | 'road' | 'mountain' | 'dirt' | 'circuit' | 'strip';

export interface RoadKindInfo {
  width: number; // asphalt width (m)
  lanesPerDir: number;
  oneWay?: boolean;
  speed: number; // traffic cruise speed (m/s)
  surface: Surface;
  smoothing: number; // elevation smoothing window (m)
  maxGrade: number;
  lights: boolean;
  rails: 'none' | 'drop' | 'always';
  traffic: boolean;
}

export const ROAD_KINDS: Record<RoadKind, RoadKindInfo> = {
  highway: { width: 17, lanesPerDir: 2, speed: 31, surface: Surface.Asphalt, smoothing: 260, maxGrade: 0.06, lights: true, rails: 'always', traffic: true },
  boulevard: { width: 15, lanesPerDir: 2, speed: 17, surface: Surface.Asphalt, smoothing: 60, maxGrade: 0.08, lights: true, rails: 'none', traffic: true },
  street: { width: 10, lanesPerDir: 1, speed: 13, surface: Surface.Asphalt, smoothing: 40, maxGrade: 0.1, lights: true, rails: 'none', traffic: true },
  road: { width: 9, lanesPerDir: 1, speed: 21, surface: Surface.Asphalt, smoothing: 140, maxGrade: 0.09, lights: false, rails: 'drop', traffic: true },
  mountain: { width: 8, lanesPerDir: 1, speed: 14, surface: Surface.Asphalt, smoothing: 90, maxGrade: 0.15, lights: false, rails: 'drop', traffic: true },
  dirt: { width: 7, lanesPerDir: 1, speed: 11, surface: Surface.Gravel, smoothing: 40, maxGrade: 0.16, lights: false, rails: 'none', traffic: false },
  circuit: { width: 14, lanesPerDir: 1, oneWay: true, speed: 30, surface: Surface.Asphalt, smoothing: 120, maxGrade: 0.06, lights: true, rails: 'always', traffic: false },
  strip: { width: 16, lanesPerDir: 1, speed: 30, surface: Surface.Concrete, smoothing: 400, maxGrade: 0.02, lights: true, rails: 'none', traffic: false },
};

export interface RoadDef {
  id: string;
  name: string;
  kind: RoadKind;
  loop: boolean;
  pts: [number, number][];
}

/** City block grid. */
export const CITY = { x0: 100, x1: 1200, z0: -550, z1: 550, cols: 8, rows: 8 };
export const PORT = { x0: 320, x1: 1130, z0: 660, z1: 1230 };

function cityStreets(): RoadDef[] {
  const out: RoadDef[] = [];
  const { x0, x1, z0, z1, cols, rows } = CITY;
  for (let i = 1; i < cols; i++) {
    const x = x0 + ((x1 - x0) * i) / cols;
    out.push({ id: `st_v${i}`, name: `Avenida ${i}`, kind: 'street', loop: false, pts: [[x, z0], [x, z1]] });
  }
  for (let j = 1; j < rows; j++) {
    const z = z0 + ((z1 - z0) * j) / rows;
    out.push({ id: `st_h${j}`, name: `Calle ${j}`, kind: 'street', loop: false, pts: [[x0, z], [x1, z]] });
  }
  return out;
}

function roundedRect(x0: number, z0: number, x1: number, z1: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  const corners: [number, number, number][] = [
    [x1 - r, z0 + r, -Math.PI / 2],
    [x1 - r, z1 - r, 0],
    [x0 + r, z1 - r, Math.PI / 2],
    [x0 + r, z0 + r, Math.PI],
  ];
  corners.forEach(([cx, cz, a0], ci) => {
    for (let k = 0; k <= 3; k++) {
      const a = a0 + (k / 3) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    // straight edge to the next corner: intermediate points keep the spline straight
    const [nx, nz, na] = corners[(ci + 1) % 4];
    const ex = cx + Math.cos(a0 + Math.PI / 2) * r, ez = cz + Math.sin(a0 + Math.PI / 2) * r;
    const sx = nx + Math.cos(na) * r, sz = nz + Math.sin(na) * r;
    const L = Math.hypot(sx - ex, sz - ez);
    const k = Math.floor(L / 60);
    for (let i = 1; i < k; i++) pts.push([ex + ((sx - ex) * i) / k, ez + ((sz - ez) * i) / k]);
  });
  return pts;
}

export const ROADS: RoadDef[] = [
  {
    id: 'hw', name: 'Autopista Anillo A1', kind: 'highway', loop: true,
    pts: [
      [-1450, -1560], [-900, -1800], [-200, -1880], [500, -1890], [1120, -1720], [1370, -1260], [1330, -700], [1310, -100], [1320, 600], [1360, 1180],
      [1150, 1640], [500, 1800], [-300, 1850], [-1000, 1770], [-1580, 1450], [-1840, 820], [-1880, 100], [-1830, -620], [-1720, -1150],
    ],
  },
  { id: 'blvd', name: 'Bulevar del Puerto', kind: 'boulevard', loop: true, pts: roundedRect(CITY.x0, CITY.z0, CITY.x1, CITY.z1, 90) },
  ...cityStreets(),
  { id: 'east', name: 'Enlace Este', kind: 'boulevard', loop: false, pts: [[1200, 10], [1260, -20], [1312, -60]] },
  {
    id: 'coast', name: 'Carretera de la Costa', kind: 'road', loop: false,
    pts: [[1260, -1530], [1400, -1450], [1490, -1100], [1520, -600], [1500, -100], [1495, 400], [1470, 850], [1385, 1120]],
  },
  {
    id: 'rural', name: 'Carretera de los Campos', kind: 'road', loop: false,
    pts: [[100, 60], [-250, 70], [-700, 140], [-1150, 40], [-1550, 110], [-1875, 120]],
  },
  {
    id: 'pass', name: 'Puerto de Sierra Alta', kind: 'mountain', loop: false,
    pts: [
      [-300, 66], [-340, -200], [-430, -430], [-600, -560], [-480, -680], [-700, -720], [-540, -840], [-780, -880], [-620, -980], [-860, -1000],
      [-760, -1110], [-960, -1120], [-1050, -1170], [-1240, -1100], [-1420, -1220], [-1330, -1380], [-1500, -1470], [-1470, -1545],
    ],
  },
  {
    id: 'forestlink', name: 'Camino del Bosque', kind: 'dirt', loop: false,
    pts: [[-700, 140], [-730, 320], [-700, 500]],
  },
  {
    id: 'forest', name: 'Pista Forestal', kind: 'dirt', loop: true,
    pts: [[-700, 500], [-1100, 700], [-1450, 1000], [-1380, 1400], [-950, 1560], [-620, 1260], [-560, 860]],
  },
  {
    id: 'south', name: 'Carretera del Río', kind: 'road', loop: false,
    pts: [[100, 470], [-60, 760], [-180, 1150], [-240, 1500], [-300, 1845]],
  },
  {
    id: 'portin', name: 'Acceso al Puerto', kind: 'boulevard', loop: false,
    pts: [[650, 550], [650, 660], [660, 720]],
  },
  {
    id: 'port', name: 'Muelles', kind: 'road', loop: true,
    pts: [[660, 720], [1100, 740], [1110, 1180], [360, 1190], [350, 740]],
  },
  {
    id: 'strip', name: 'Recta de Velocidad', kind: 'strip', loop: false,
    pts: [[-620, 1300], [0, 1300], [600, 1300], [1250, 1300]],
  },
  {
    id: 'stripin', name: 'Acceso a la Recta', kind: 'road', loop: false,
    pts: [[700, 1190], [690, 1250], [700, 1300]],
  },
  {
    id: 'ring', name: 'Circuito Calder', kind: 'circuit', loop: true,
    pts: [
      [100, -1250], [140, -1450], [330, -1560], [640, -1500], [840, -1610], [990, -1470], [840, -1330], [920, -1170], [720, -1090], [470, -1200], [270, -1100],
    ],
  },
  {
    id: 'ringin', name: 'Acceso al Circuito', kind: 'road', loop: false,
    pts: [[520, -550], [500, -800], [470, -1000], [470, -1200]],
  },
  {
    id: 'hill', name: 'Subida del Faro', kind: 'road', loop: false,
    pts: [[1110, -550], [1080, -880], [1240, -1180], [1372, -1250]],
  },
];

export interface RiverDef {
  pts: [number, number][];
  width: number;
  topY: number;
}
export const RIVER: RiverDef = {
  pts: [[-1100, -720], [-820, -360], [-560, 230], [-260, 700], [150, 1010], [520, 1370], [1000, 1500], [1700, 1560]],
  width: 34,
  topY: 46,
};

export type ZoneId = 'city' | 'port' | 'sierra' | 'forest' | 'fields' | 'coast' | 'raceway' | 'valley';
export interface ZoneDef {
  id: ZoneId;
  name: { es: string; en: string };
  x: number;
  z: number;
  r: number;
}
export const ZONES: ZoneDef[] = [
  { id: 'city', name: { es: 'Puerto Calder', en: 'Port Calder' }, x: 650, z: 0, r: 650 },
  { id: 'port', name: { es: 'Muelles Industriales', en: 'Industrial Docks' }, x: 720, z: 980, r: 420 },
  { id: 'sierra', name: { es: 'Sierra Alta', en: 'Sierra Alta' }, x: -1150, z: -1150, r: 750 },
  { id: 'forest', name: { es: 'Bosque de Vallina', en: 'Vallina Forest' }, x: -1000, z: 1100, r: 650 },
  { id: 'fields', name: { es: 'Campos de Olmedo', en: 'Olmedo Fields' }, x: -800, z: -50, r: 550 },
  { id: 'coast', name: { es: 'Costa Brava Sur', en: 'Southern Coast' }, x: 1520, z: -300, r: 520 },
  { id: 'raceway', name: { es: 'Circuito Calder', en: 'Calder Raceway' }, x: 540, z: -1350, r: 450 },
  { id: 'valley', name: { es: 'Valle del Río', en: 'River Valley' }, x: -100, z: 900, r: 450 },
];

export type PoiKind = 'garage' | 'gas' | 'viewpoint' | 'bonus' | 'speedtrap' | 'driftzone' | 'jump';
export interface PoiDef {
  id: string;
  kind: PoiKind;
  x: number;
  z: number;
  /** heading in radians for oriented POIs */
  rot?: number;
  name?: { es: string; en: string };
}

export const POIS: PoiDef[] = [
  { id: 'garage_city', kind: 'garage', x: 560, z: -70, name: { es: 'Garaje Central', en: 'Central Garage' } },
  { id: 'garage_sierra', kind: 'garage', x: -1060, z: -1230, name: { es: 'Taller del Puerto', en: 'Mountain Workshop' } },
  { id: 'garage_port', kind: 'garage', x: 930, z: 760, name: { es: 'Taller del Muelle', en: 'Dockside Workshop' } },
  { id: 'gas_rural', kind: 'gas', x: -1150, z: 70, name: { es: 'Gasolinera Olmedo', en: 'Olmedo Fuel' } },
  { id: 'gas_hw_s', kind: 'gas', x: 200, z: 1830, name: { es: 'Área de Servicio Sur', en: 'South Services' } },
  { id: 'gas_coast', kind: 'gas', x: 1470, z: 200, name: { es: 'Gasolinera de la Costa', en: 'Coast Fuel' } },
  { id: 'gas_hw_n', kind: 'gas', x: 100, z: -1905, name: { es: 'Área de Servicio Norte', en: 'North Services' } },
  { id: 'view_summit', kind: 'viewpoint', x: -1050, z: -1205, name: { es: 'Mirador de la Cumbre', en: 'Summit Lookout' } },
  { id: 'view_cliff', kind: 'viewpoint', x: 1500, z: -1080, name: { es: 'Mirador del Faro', en: 'Lighthouse Point' } },
  { id: 'view_river', kind: 'viewpoint', x: -1380, z: 1400, name: { es: 'Mirador del Bosque', en: 'Forest Lookout' } },
  { id: 'view_port', kind: 'viewpoint', x: 1240, z: 1250, name: { es: 'Mirador del Puerto', en: 'Harbour View' } },
  { id: 'trap_hw_e', kind: 'speedtrap', x: 1318, z: 200 },
  { id: 'trap_hw_n', kind: 'speedtrap', x: 200, z: -1886 },
  { id: 'trap_strip', kind: 'speedtrap', x: 300, z: 1300 },
  { id: 'trap_hw_w', kind: 'speedtrap', x: -1870, z: 400 },
  { id: 'trap_coast', kind: 'speedtrap', x: 1505, z: -300 },
  { id: 'drift_pass', kind: 'driftzone', x: -600, z: -760 },
  { id: 'drift_port', kind: 'driftzone', x: 700, z: 1190 },
  { id: 'drift_forest', kind: 'driftzone', x: -1300, z: 900 },
];
