import type { CarClass } from '../vehicles/Performance';
import type { RouteLeg } from './Route';

export type EventType = 'sprint' | 'circuit' | 'street' | 'mountain' | 'timetrial' | 'topspeed' | 'drift' | 'pursuit' | 'checkpoints' | 'special';

export interface EventDef {
  id: string;
  type: EventType;
  name: { es: string; en: string };
  desc: { es: string; en: string };
  legs: RouteLeg[];
  closed: boolean;
  laps: number;
  rivals: number;
  difficulty: 1 | 2 | 3 | 4;
  maxClass?: CarClass;
  minLevel: number;
  reward: { cash: number; xp: number };
  /** For time trials / checkpoints: target times (s) gold/silver/bronze; for drift/topspeed: scores. */
  targets?: [number, number, number];
  traffic: boolean;
  time?: number;
  weather?: 'clear' | 'cloudy' | 'rain' | 'storm';
  /** Revealed from the start (otherwise discovered by driving near). */
  known?: boolean;
  /** Police count for pursuits. */
  police?: number;
  duration?: number;
}

const N = (es: string, en: string) => ({ es, en });

export const EVENTS: EventDef[] = [
  {
    id: 'e_first', type: 'sprint', name: N('Primeras Marchas', 'First Gears'), desc: N('Sprint por la carretera de los campos. Demuestra lo que vales.', 'A sprint down the field road. Show what you have got.'),
    legs: [{ road: 'rural', from: [60, 61], to: [-1120, 42] }], closed: false, laps: 1, rivals: 3, difficulty: 1, maxClass: 'C', minLevel: 1, reward: { cash: 4500, xp: 900 }, traffic: true, known: true,
  },
  {
    id: 'e_blvd', type: 'street', name: N('Bulevar Nocturno', 'Night Boulevard'), desc: N('Dos vueltas al bulevar del puerto bajo las luces de la ciudad.', 'Two laps of the harbour boulevard under the city lights.'),
    legs: [{ road: 'blvd', from: [650, -550], to: [650, -550], dir: 1 }], closed: true, laps: 2, rivals: 5, difficulty: 1, maxClass: 'C', minLevel: 1, reward: { cash: 6000, xp: 1200 }, traffic: true, time: 22, known: true,
  },
  {
    id: 'e_port', type: 'circuit', name: N('Vuelta al Puerto', 'Dockside Circuit'), desc: N('Circuito entre contenedores y grúas. Curvas de 90 grados y frenadas fuertes.', 'A circuit among containers and cranes. Ninety-degree turns and heavy braking.'),
    legs: [{ road: 'port', from: [700, 722], to: [700, 722], dir: 1 }], closed: true, laps: 3, rivals: 4, difficulty: 2, maxClass: 'B', minLevel: 2, reward: { cash: 9000, xp: 1700 }, traffic: false,
  },
  {
    id: 'e_gp', type: 'circuit', name: N('Gran Premio Calder', 'Calder Grand Prix'), desc: N('Tres vueltas al circuito permanente. Siete rivales y cero margen de error.', 'Three laps of the permanent circuit. Seven rivals, zero room for error.'),
    legs: [{ road: 'ring', from: [120, -1300], to: [120, -1300], dir: 1 }], closed: true, laps: 3, rivals: 7, difficulty: 3, maxClass: 'A', minLevel: 4, reward: { cash: 22000, xp: 3800 }, traffic: false,
  },
  {
    id: 'e_hillclimb', type: 'mountain', name: N('Rey de la Sierra', 'King of the Sierra'), desc: N('Subida al puerto de montaña: horquillas, quitamiedos y vistas de vértigo.', 'Climb the mountain pass: hairpins, guard rails and dizzying views.'),
    legs: [{ road: 'pass', from: [-310, 0], to: [-1040, -1168] }], closed: false, laps: 1, rivals: 3, difficulty: 2, maxClass: 'B', minLevel: 3, reward: { cash: 12000, xp: 2400 }, traffic: false,
  },
  {
    id: 'e_downhill', type: 'mountain', name: N('Descenso del Puerto', 'Pass Descent'), desc: N('Bajada técnica hacia la autopista. Los frenos serán tu mejor amigo.', 'A technical descent to the highway. Brakes will be your best friend.'),
    legs: [{ road: 'pass', from: [-1060, -1170], to: [-1480, -1530] }], closed: false, laps: 1, rivals: 4, difficulty: 3, maxClass: 'A', minLevel: 5, reward: { cash: 15000, xp: 2800 }, traffic: false, time: 19,
  },
  {
    id: 'e_express', type: 'sprint', name: N('Anillo Exprés', 'Ring Express'), desc: N('Sprint de alta velocidad por la autopista esquivando tráfico.', 'High-speed highway sprint dodging traffic.'),
    legs: [{ road: 'hw', from: [1312, -60], to: [500, 1800], dir: 1 }], closed: false, laps: 1, rivals: 5, difficulty: 2, maxClass: 'A', minLevel: 3, reward: { cash: 14000, xp: 2600 }, traffic: true,
  },
  {
    id: 'e_coast_tt', type: 'timetrial', name: N('Contrarreloj Costera', 'Coastal Time Trial'), desc: N('Recorre la carretera de la costa contra el crono.', 'Run the coast road against the clock.'),
    legs: [{ road: 'coast', from: [1290, -1520], to: [1390, 1110] }], closed: false, laps: 1, rivals: 0, difficulty: 2, minLevel: 2, reward: { cash: 8000, xp: 1600 }, targets: [88, 98, 112], traffic: false, known: true,
  },
  {
    id: 'e_mile', type: 'topspeed', name: N('Milla Calder', 'Calder Mile'), desc: N('Recta de velocidad: pasa por el radar final lo más rápido posible.', 'Speed strip: hit the final radar as fast as you can.'),
    legs: [{ road: 'strip', from: [-600, 1300], to: [1200, 1300] }], closed: false, laps: 1, rivals: 0, difficulty: 1, minLevel: 1, reward: { cash: 5000, xp: 1000 }, targets: [300, 250, 200], traffic: false, known: true,
  },
  {
    id: 'e_rally', type: 'sprint', name: N('Rally del Bosque', 'Forest Rally'), desc: N('Pista de tierra entre pinos. Coches con buena tracción, adelante.', 'Gravel track among pines. Grippy cars welcome.'),
    legs: [{ road: 'forest', from: [-700, 500], to: [-700, 500], dir: 1 }], closed: true, laps: 1, rivals: 3, difficulty: 2, minLevel: 2, reward: { cash: 11000, xp: 2100 }, traffic: false, weather: 'cloudy',
  },
  {
    id: 'e_drift_port', type: 'drift', name: N('Drift del Muelle', 'Dockside Drift'), desc: N('Acumula puntos derrapando por los muelles. Encadena curvas para multiplicar.', 'Score points drifting around the docks. Chain corners to multiply.'),
    legs: [{ road: 'port', from: [700, 722], to: [700, 722], dir: 1 }], closed: true, laps: 2, rivals: 0, difficulty: 2, minLevel: 2, reward: { cash: 9000, xp: 1800 }, targets: [40000, 25000, 12000], traffic: false, time: 20.5,
  },
  {
    id: 'e_drift_pass', type: 'drift', name: N('Drift de Sierra', 'Sierra Drift'), desc: N('Las horquillas del puerto son perfectas para cruzar el coche.', 'The pass hairpins are perfect for going sideways.'),
    legs: [{ road: 'pass', from: [-430, -430], to: [-960, -1120] }], closed: false, laps: 1, rivals: 0, difficulty: 3, minLevel: 4, reward: { cash: 13000, xp: 2500 }, targets: [45000, 28000, 14000], traffic: false,
  },
  {
    id: 'e_pursuit_city', type: 'pursuit', name: N('Fuga Urbana', 'Urban Getaway'), desc: N('La policía te ha visto. Aguanta 90 segundos sin que te detengan.', 'The police spotted you. Survive 90 seconds without getting busted.'),
    legs: [{ road: 'blvd', from: [1100, 550], to: [1100, 550], dir: 1 }], closed: true, laps: 1, rivals: 0, difficulty: 2, minLevel: 2, reward: { cash: 12000, xp: 2400 }, traffic: true, police: 2, duration: 90,
  },
  {
    id: 'e_pursuit_hw', type: 'pursuit', name: N('Persecución en la Autopista', 'Highway Pursuit'), desc: N('Tres patrullas interceptoras. Velocidad punta o te atrapan.', 'Three interceptors. Top speed or you are caught.'),
    legs: [{ road: 'hw', from: [-1880, 200], to: [-1880, 200], dir: 1 }], closed: true, laps: 1, rivals: 0, difficulty: 4, minLevel: 7, reward: { cash: 30000, xp: 5200 }, traffic: true, police: 3, duration: 120,
  },
  {
    id: 'e_cp_coast', type: 'checkpoints', name: N('De Costa a Costa', 'Coast to Coast'), desc: N('Pasa por cada control antes de que se agote el tiempo.', 'Reach each checkpoint before the timer runs out.'),
    legs: [{ road: 'hill', from: [1110, -550], to: [1370, -1250] }, { road: 'hw', from: [1370, -1258], to: [1262, -1532], dir: -1 }, { road: 'coast', from: [1270, -1525], to: [1390, 1110] }], closed: false, laps: 1, rivals: 0, difficulty: 2, minLevel: 3, reward: { cash: 10000, xp: 2000 }, targets: [30, 0, 0], traffic: true,
  },
  {
    id: 'e_island_gp', type: 'special', name: N('Gran Vuelta a la Isla', 'Island Grand Tour'), desc: N('Una vuelta completa a la autopista anillo: 12 km de puro gas.', 'A full lap of the ring highway: 12 km flat out.'),
    legs: [{ road: 'hw', from: [-1880, 100], to: [-1880, 100], dir: 1 }], closed: true, laps: 1, rivals: 7, difficulty: 4, minLevel: 8, reward: { cash: 60000, xp: 9000 }, traffic: true,
  },
  {
    id: 'e_lighthouse', type: 'special', name: N('Duelo en el Faro', 'Lighthouse Duel'), desc: N('Uno contra uno frente al campeón local, al atardecer.', 'One-on-one against the local champion, at sunset.'),
    legs: [{ road: 'hill', from: [1110, -550], to: [1370, -1250] }, { road: 'hw', from: [1370, -1258], to: [1262, -1532], dir: -1 }, { road: 'coast', from: [1270, -1525], to: [1495, -100] }], closed: false, laps: 1, rivals: 1, difficulty: 4, minLevel: 6, reward: { cash: 35000, xp: 6000 }, traffic: false, time: 18.6,
  },
  {
    id: 'e_streets', type: 'street', name: N('Calles de Calder', 'Calder Streets'), desc: N('Carrera por el corazón de la ciudad: avenidas, cruces y rascacielos.', 'A race through the heart of the city: avenues, crossings and skyscrapers.'),
    legs: [
      { road: 'st_h2', from: [100, -275], to: [1200, -275] },
      { road: 'blvd', from: [1200, -275], to: [1200, 275], dir: 1 },
      { road: 'st_h6', from: [1200, 275], to: [100, 275] },
      { road: 'blvd', from: [100, 275], to: [100, -275], dir: 1 },
    ],
    closed: true, laps: 2, rivals: 5, difficulty: 2, maxClass: 'B', minLevel: 2, reward: { cash: 10000, xp: 2000 }, traffic: true, known: true,
  },
  {
    id: 'e_gp_tt', type: 'timetrial', name: N('Vuelta Rápida Calder', 'Calder Hot Lap'), desc: N('Una vuelta lanzada al circuito. Bate los tiempos de referencia.', 'One flying lap of the circuit. Beat the reference times.'),
    legs: [{ road: 'ring', from: [120, -1300], to: [120, -1300], dir: 1 }], closed: true, laps: 1, rivals: 0, difficulty: 3, minLevel: 3, reward: { cash: 9000, xp: 1900 }, targets: [62, 70, 80], traffic: false,
  },
  {
    id: 'e_river', type: 'sprint', name: N('Sprint del Río', 'River Sprint'), desc: N('De la ciudad a la autopista sur cruzando el valle del río.', 'From the city to the south highway across the river valley.'),
    legs: [{ road: 'south', from: [100, 470], to: [-300, 1840] }], closed: false, laps: 1, rivals: 4, difficulty: 2, maxClass: 'B', minLevel: 2, reward: { cash: 9500, xp: 1900 }, traffic: true, weather: 'rain',
  },
];

export function getEvent(id: string) {
  return EVENTS.find((e) => e.id === id)!;
}
