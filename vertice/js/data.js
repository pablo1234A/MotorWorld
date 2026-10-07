// VÉRTICE — datos de juego (armas, operadores, modos, dificultades...)
// Todo el contenido es original.

export const GAME_NAME = 'VÉRTICE';
export const GAME_SUB = 'FRENTE URBANO';

export const TEAMS = [
  { id: 0, name: 'VANGUARDIA', short: 'VNG', color: '#3fa7ff', hex: 0x3fa7ff },
  { id: 1, name: 'CUERVO', short: 'CRV', color: '#ff4d3a', hex: 0xff4d3a },
];

// ---------------------------------------------------------------- ARMAS
// dmg: daño base por proyectil; range: [inicio caída, fin caída]; minMul: multiplicador al final
// spread en grados; recoil: {v: patada vertical (grados), h: horizontal, rec: recuperación}
export const WEAPONS = {
  vx9: {
    id: 'vx9', name: 'VX-9 HALCÓN', cls: 'Fusil de asalto', slot: 'primary', unlock: 1,
    dmg: 27, head: 1.6, range: [28, 60], minMul: 0.7, rpm: 720, auto: true, pellets: 1,
    mag: 30, reserve: 150, reload: 2.0, reloadEmpty: 2.5, swap: 0.45,
    spreadHip: 3.2, spreadAds: 0.25, moveSpread: 1.8, recoil: { v: 0.55, h: 0.3, rec: 9 },
    ads: 0.22, zoom: 1.35, move: 0.95, sound: 'ar', model: { type: 'ar', len: 0.78, barrel: 0.32, color: 0x2b2e31 },
  },
  kr4: {
    id: 'kr4', name: 'KR-4 TORMENTA', cls: 'Fusil de asalto', slot: 'primary', unlock: 4,
    dmg: 34, head: 1.5, range: [32, 70], minMul: 0.72, rpm: 560, auto: true, pellets: 1,
    mag: 25, reserve: 125, reload: 2.2, reloadEmpty: 2.8, swap: 0.5,
    spreadHip: 3.6, spreadAds: 0.22, moveSpread: 1.9, recoil: { v: 0.85, h: 0.4, rec: 8 },
    ads: 0.26, zoom: 1.35, move: 0.92, sound: 'ar2', model: { type: 'ar', len: 0.84, barrel: 0.38, color: 0x3a3428 },
  },
  mosca: {
    id: 'mosca', name: 'MOSCA R5', cls: 'Subfusil', slot: 'primary', unlock: 1,
    dmg: 21, head: 1.4, range: [12, 30], minMul: 0.55, rpm: 900, auto: true, pellets: 1,
    mag: 32, reserve: 192, reload: 1.7, reloadEmpty: 2.1, swap: 0.35,
    spreadHip: 2.6, spreadAds: 0.45, moveSpread: 1.2, recoil: { v: 0.38, h: 0.38, rec: 11 },
    ads: 0.17, zoom: 1.25, move: 1.05, sound: 'smg', model: { type: 'smg', len: 0.58, barrel: 0.16, color: 0x1e2124 },
  },
  bulldog: {
    id: 'bulldog', name: 'BULLDOG 12', cls: 'Escopeta', slot: 'primary', unlock: 2,
    dmg: 15, head: 1.25, range: [6, 16], minMul: 0.18, rpm: 75, auto: false, pellets: 9,
    mag: 6, reserve: 36, reload: 2.8, reloadEmpty: 3.2, swap: 0.45,
    spreadHip: 5.5, spreadAds: 4.2, moveSpread: 1.1, recoil: { v: 4.2, h: 0.8, rec: 6 },
    ads: 0.22, zoom: 1.15, move: 0.98, sound: 'shotgun', model: { type: 'shotgun', len: 0.9, barrel: 0.48, color: 0x2a2622 },
  },
  sable: {
    id: 'sable', name: 'SABLE LR-8', cls: 'Rifle de precisión', slot: 'primary', unlock: 3,
    dmg: 92, head: 2.2, range: [60, 140], minMul: 0.9, rpm: 48, auto: false, pellets: 1, chest: 1.15,
    mag: 5, reserve: 30, reload: 3.0, reloadEmpty: 3.4, swap: 0.6,
    spreadHip: 8, spreadAds: 0.0, moveSpread: 3, recoil: { v: 4.5, h: 0.6, rec: 4 },
    ads: 0.38, zoom: 4.5, move: 0.88, scope: true, sound: 'sniper', model: { type: 'sniper', len: 1.1, barrel: 0.55, color: 0x2f3330 },
  },
  yunque: {
    id: 'yunque', name: 'YUNQUE 7', cls: 'Ametralladora ligera', slot: 'primary', unlock: 6,
    dmg: 29, head: 1.4, range: [35, 75], minMul: 0.75, rpm: 640, auto: true, pellets: 1,
    mag: 90, reserve: 180, reload: 4.6, reloadEmpty: 5.2, swap: 0.7,
    spreadHip: 4.4, spreadAds: 0.4, moveSpread: 2.2, recoil: { v: 0.6, h: 0.5, rec: 7 },
    ads: 0.36, zoom: 1.35, move: 0.84, sound: 'lmg', model: { type: 'lmg', len: 0.98, barrel: 0.42, color: 0x33362e },
  },
  centinela: {
    id: 'centinela', name: 'CENTINELA M-DMR', cls: 'Tirador designado', slot: 'primary', unlock: 8,
    dmg: 49, head: 1.8, range: [45, 100], minMul: 0.8, rpm: 330, auto: false, pellets: 1,
    mag: 15, reserve: 75, reload: 2.4, reloadEmpty: 2.9, swap: 0.5,
    spreadHip: 4.2, spreadAds: 0.12, moveSpread: 2.4, recoil: { v: 1.8, h: 0.35, rec: 7 },
    ads: 0.3, zoom: 2.4, move: 0.9, sound: 'dmr', model: { type: 'dmr', len: 0.98, barrel: 0.46, color: 0x4a4536 },
  },
  ronin: {
    id: 'ronin', name: 'RONIN P9', cls: 'Pistola', slot: 'secondary', unlock: 1,
    dmg: 26, head: 1.5, range: [12, 30], minMul: 0.6, rpm: 420, auto: false, pellets: 1,
    mag: 12, reserve: 60, reload: 1.4, reloadEmpty: 1.7, swap: 0.25,
    spreadHip: 2.4, spreadAds: 0.5, moveSpread: 1.0, recoil: { v: 1.4, h: 0.4, rec: 10 },
    ads: 0.14, zoom: 1.2, move: 1.08, sound: 'pistol', model: { type: 'pistol', len: 0.22, barrel: 0.0, color: 0x1c1d1f },
  },
  toro: {
    id: 'toro', name: 'TORO .44', cls: 'Revólver', slot: 'secondary', unlock: 3,
    dmg: 58, head: 1.6, range: [15, 35], minMul: 0.6, rpm: 150, auto: false, pellets: 1,
    mag: 6, reserve: 36, reload: 2.3, reloadEmpty: 2.3, swap: 0.3,
    spreadHip: 2.8, spreadAds: 0.35, moveSpread: 1.2, recoil: { v: 4.0, h: 0.7, rec: 6 },
    ads: 0.18, zoom: 1.25, move: 1.06, sound: 'revolver', model: { type: 'revolver', len: 0.3, barrel: 0.12, color: 0x8a8c8e },
  },
  avispa: {
    id: 'avispa', name: 'AVISPA MP', cls: 'Pistola automática', slot: 'secondary', unlock: 5,
    dmg: 18, head: 1.35, range: [8, 20], minMul: 0.5, rpm: 1000, auto: true, pellets: 1,
    mag: 20, reserve: 100, reload: 1.6, reloadEmpty: 1.9, swap: 0.25,
    spreadHip: 3.4, spreadAds: 1.1, moveSpread: 1.0, recoil: { v: 0.5, h: 0.6, rec: 11 },
    ads: 0.15, zoom: 1.2, move: 1.06, sound: 'mp', model: { type: 'mp', len: 0.3, barrel: 0.04, color: 0x262829 },
  },
};
export const PRIMARIES = ['vx9', 'mosca', 'bulldog', 'sable', 'kr4', 'yunque', 'centinela'];
export const SECONDARIES = ['ronin', 'toro', 'avispa'];

export const OPTICS = {
  iron: { id: 'iron', name: 'Miras metálicas', zoomMul: 1.0, unlock: 1 },
  dot: { id: 'dot', name: 'Punto rojo R1', zoomMul: 1.05, unlock: 1 },
  holo: { id: 'holo', name: 'Holográfica H2', zoomMul: 1.08, unlock: 2 },
  x3: { id: 'x3', name: 'Óptica 3x "Lince"', zoomMul: 1.9, unlock: 7 },
};

// Camuflajes de arma (procedurales)
export const CAMOS = {
  pavonado: { id: 'pavonado', name: 'Pavonado', colors: ['#2a2d30', '#202326', '#33373b'], pattern: 'plain', unlock: 1 },
  arena: { id: 'arena', name: 'Arena', colors: ['#b49a6a', '#9c8255', '#c9b385'], pattern: 'blotch', unlock: 2 },
  bosque: { id: 'bosque', name: 'Bosque digital', colors: ['#4b5a37', '#2e3a24', '#6b7146', '#1d2418'], pattern: 'digital', unlock: 4 },
  artico: { id: 'artico', name: 'Ártico', colors: ['#d8dde0', '#a9b2b8', '#7d878e'], pattern: 'blotch', unlock: 6 },
  carbono: { id: 'carbono', name: 'Fibra de carbono', colors: ['#16171a', '#2a2c30'], pattern: 'weave', unlock: 9 },
  ascua: { id: 'ascua', name: 'Ascua', colors: ['#2a120c', '#b23a12', '#f28a1c'], pattern: 'tiger', unlock: 12 },
  oro: { id: 'oro', name: 'Oro táctico', colors: ['#c9a227', '#e8c75a', '#8f6f12'], pattern: 'metal', unlock: 18 },
  vertice: { id: 'vertice', name: 'Neón Vértice', colors: ['#0b0f14', '#00e5c8', '#ff3d7f'], pattern: 'digital', challenge: 'elite_win' },
};

export const LETHALS = {
  frag: { id: 'frag', name: 'Fragmentación "Piña"', desc: 'Detona a los 2,4 s. Gran radio.', count: 1, fuse: 2.4, radius: 7.5, dmg: 150, impact: false },
  impact: { id: 'impact', name: 'Impacto "Martillo"', desc: 'Explota al tocar superficie. Radio menor.', count: 1, fuse: 6, radius: 5, dmg: 125, impact: true, unlock: 5 },
};
export const TACTICALS = {
  smoke: { id: 'smoke', name: 'Humo "Niebla"', desc: 'Cortina de humo de 14 s. Bloquea la visión de la IA.', count: 1, fuse: 1.2 },
  flash: { id: 'flash', name: 'Aturdidora "Trueno"', desc: 'Ciega y desorienta a los enemigos cercanos.', count: 2, fuse: 1.4, unlock: 2 },
};

export const PERKS = {
  kevlar: { id: 'kevlar', name: 'Chaleco de kevlar', desc: '+50 de armadura que absorbe la mitad del daño.', unlock: 1 },
  atleta: { id: 'atleta', name: 'Atleta', desc: 'Doble resistencia y sprint un 8 % más rápido.', unlock: 1 },
  manos: { id: 'manos', name: 'Manos rápidas', desc: 'Recarga y cambio de arma un 35 % más rápidos.', unlock: 3 },
  carronero: { id: 'carronero', name: 'Carroñero', desc: 'Las bajas recargan munición y explosivos.', unlock: 5 },
  fantasma: { id: 'fantasma', name: 'Fantasma', desc: 'Invisible al reconocimiento enemigo. Pasos silenciosos.', unlock: 9 },
};

// ---------------------------------------------------------------- OPERADORES
export const OPERATORS = [
  { id: 'raya', name: 'RAYA', full: 'Inés "Raya" Castell', role: 'Reconocimiento', bio: 'Exploradora de vanguardia. Rápida, precisa y silenciosa.', skin: '#c99a76', build: 0.94, head: 'cap', face: 'glasses', hair: '#2b1d14' },
  { id: 'bastion', name: 'BASTIÓN', full: 'Teo "Bastión" Arriaga', role: 'Asalto pesado', bio: 'Rompe-puertas veterano. Donde entra él, entra el equipo.', skin: '#a8714f', build: 1.12, head: 'helmet', face: 'balaclava', hair: '#1a1410' },
  { id: 'nyx', name: 'NYX', full: 'Mara "Nyx" Lindqvist', role: 'Tiradora', bio: 'Paciencia infinita. Nunca falla el primer disparo.', skin: '#e3c2a6', build: 0.92, head: 'hood', face: 'none', hair: '#d8c49a' },
  { id: 'kodiak', name: 'KODIAK', full: 'Andrei "Kodiak" Vasko', role: 'Apoyo', bio: 'Mantiene la línea con fuego de supresión constante.', skin: '#d6a98a', build: 1.08, head: 'helmet', face: 'goggles', hair: '#6b4a2f' },
  { id: 'ceniza', name: 'CENIZA', full: 'Dayo "Ceniza" Okafor', role: 'Demoliciones', bio: 'Experto en explosivos. Convierte coberturas en escombros.', skin: '#6b4430', build: 1.02, head: 'beanie', face: 'gasmask', hair: '#120d0a' },
  { id: 'mako', name: 'MAKO', full: 'Ren "Mako" Takeda', role: 'Infiltración', bio: 'Especialista en flanqueos. Aparece donde nadie mira.', skin: '#d9b58f', build: 0.98, head: 'helmet', face: 'mask', hair: '#0e0e10' },
];

export const SKINS = {
  urbano: { id: 'urbano', name: 'Urbano gris', colors: ['#5d6166', '#44484d', '#7b7f84', '#2f3236'], pattern: 'blotch', unlock: 1 },
  desierto: { id: 'desierto', name: 'Desierto', colors: ['#a68f68', '#8a7350', '#c2ad86', '#6e5a3e'], pattern: 'blotch', unlock: 1 },
  bosque: { id: 'bosque', name: 'Bosque', colors: ['#56603f', '#3a4429', '#77754e', '#262c1b'], pattern: 'woodland', unlock: 1 },
  medianoche: { id: 'medianoche', name: 'Medianoche', colors: ['#1e2430', '#151a22', '#2c3444', '#0c0f14'], pattern: 'digital', unlock: 3 },
  artico: { id: 'artico', name: 'Ártico', colors: ['#d5dade', '#aab3b9', '#eef1f2', '#7f8a91'], pattern: 'digital', unlock: 6 },
  brasa: { id: 'brasa', name: 'Brasa', colors: ['#2a1a16', '#5b2316', '#8f3a1a', '#140d0b'], pattern: 'tiger', unlock: 10 },
  fantasma: { id: 'fantasma', name: 'Fantasma digital', colors: ['#2b3a3f', '#13191c', '#4f6a70', '#7fa3a8'], pattern: 'digital', unlock: 15 },
  dorado: { id: 'dorado', name: 'Élite dorado', colors: ['#2a2622', '#c9a227', '#1a1714', '#806418'], pattern: 'tiger', challenge: 'streak12' },
};

export const HEADGEAR = {
  default: { id: 'default', name: 'Por defecto del operador' },
  helmet: { id: 'helmet', name: 'Casco táctico' },
  cap: { id: 'cap', name: 'Gorra de campaña' },
  beanie: { id: 'beanie', name: 'Gorro de lana' },
  hood: { id: 'hood', name: 'Capucha' },
};
export const FACEGEAR = {
  default: { id: 'default', name: 'Por defecto del operador' },
  none: { id: 'none', name: 'Sin accesorio' },
  balaclava: { id: 'balaclava', name: 'Pasamontañas' },
  glasses: { id: 'glasses', name: 'Gafas balísticas' },
  goggles: { id: 'goggles', name: 'Gafas de visión' },
  gasmask: { id: 'gasmask', name: 'Máscara de gas' },
  mask: { id: 'mask', name: 'Media máscara' },
};
export const ACCENTS = ['#3fa7ff', '#ffb000', '#00e5a0', '#ff3d7f', '#e8e8e8', '#9b6bff'];

// ---------------------------------------------------------------- MODOS
export const MODES = {
  tdm: {
    id: 'tdm', name: 'DUELO POR EQUIPOS', short: 'DPE', tag: 'TEAM DEATHMATCH',
    desc: 'Dos equipos. El primero en alcanzar el límite de bajas gana.', teams: true, respawn: true,
  },
  dom: {
    id: 'dom', name: 'DOMINIO', short: 'DOM', tag: 'DOMINATION',
    desc: 'Captura y mantén las zonas A, B y C para sumar puntos.', teams: true, respawn: true,
  },
  sab: {
    id: 'sab', name: 'SABOTAJE', short: 'SAB', tag: 'SEARCH / OBJECTIVE',
    desc: 'Rondas sin reaparición. Planta la carga en A o B, o impídelo.', teams: true, respawn: false,
  },
  ffa: {
    id: 'ffa', name: 'TODOS CONTRA TODOS', short: 'TCT', tag: 'FREE FOR ALL',
    desc: 'Sin aliados. Gana quien consiga más bajas.', teams: false, respawn: true,
  },
};

// ---------------------------------------------------------------- DIFICULTAD IA
// Cada nivel cambia el comportamiento, no solo la puntería.
export const DIFFICULTIES = {
  easy: {
    id: 'easy', name: 'FÁCIL', desc: 'Reacción lenta, poca precisión y tácticas simples.',
    reaction: 0.95, spot: 0.7, fov: 95, viewRange: 55, turnSpeed: 130, aimErr: 9, aimSettle: 1.4,
    spreadMul: 2.4, burst: [6, 12], burstPause: [0.6, 1.2], coverChance: 0.15, flankChance: 0, strafe: 0.15,
    crouchChance: 0.05, grenadeChance: 0.0, retreatHp: 0, share: -1, lead: 0, dodgeGrenade: 0.3,
    pushOnReload: 0, think: 0.6, hearing: 0.6, preAim: false, peek: false, dmgMul: 0.75,
  },
  normal: {
    id: 'normal', name: 'NORMAL', desc: 'Comportamiento equilibrado. Usan cobertura de vez en cuando.',
    reaction: 0.55, spot: 1.0, fov: 110, viewRange: 75, turnSpeed: 200, aimErr: 5.5, aimSettle: 0.9,
    spreadMul: 1.6, burst: [4, 9], burstPause: [0.35, 0.8], coverChance: 0.45, flankChance: 0.12, strafe: 0.5,
    crouchChance: 0.2, grenadeChance: 0.12, retreatHp: 30, share: 1.6, lead: 0.2, dodgeGrenade: 0.7,
    pushOnReload: 0.15, think: 0.42, hearing: 1.0, preAim: false, peek: false, dmgMul: 0.9,
  },
  hard: {
    id: 'hard', name: 'DIFÍCIL', desc: 'Mejor puntería, buscan cobertura y flanquean.',
    reaction: 0.34, spot: 1.4, fov: 125, viewRange: 95, turnSpeed: 300, aimErr: 3.2, aimSettle: 0.55,
    spreadMul: 1.15, burst: [3, 7], burstPause: [0.22, 0.5], coverChance: 0.8, flankChance: 0.4, strafe: 0.8,
    crouchChance: 0.4, grenadeChance: 0.3, retreatHp: 45, share: 0.6, lead: 0.6, dodgeGrenade: 0.95,
    pushOnReload: 0.5, think: 0.3, hearing: 1.3, preAim: true, peek: true, dmgMul: 1.0,
  },
  elite: {
    id: 'elite', name: 'ÉLITE', desc: 'Reacción rápida, coordinación de escuadra, cercos y lectura de tus movimientos.',
    reaction: 0.2, spot: 1.9, fov: 140, viewRange: 120, turnSpeed: 420, aimErr: 1.8, aimSettle: 0.35,
    spreadMul: 0.95, burst: [3, 6], burstPause: [0.15, 0.35], coverChance: 0.95, flankChance: 0.7, strafe: 1.0,
    crouchChance: 0.5, grenadeChance: 0.45, retreatHp: 55, share: 0.0, lead: 1.0, dodgeGrenade: 1.0,
    pushOnReload: 0.9, think: 0.2, hearing: 1.6, preAim: true, peek: true, dmgMul: 1.0, squadTactics: true,
  },
};

// ---------------------------------------------------------------- RACHAS (originales)
export const STREAKS = [
  { id: 'recon', kills: 5, name: 'OJO DE HALCÓN', desc: 'Dron de reconocimiento: revela enemigos en el minimapa durante 30 s.', icon: '◉' },
  { id: 'barrage', kills: 8, name: 'LLUVIA DE ACERO', desc: 'Designa un punto: bombardeo de artillería de saturación.', icon: '✸' },
  { id: 'spectre', kills: 12, name: 'ESPECTRO', desc: 'Dron artillado autónomo que patrulla el cielo y ataca enemigos.', icon: '✈' },
];

// ---------------------------------------------------------------- ATMÓSFERAS
export const ATMOS = {
  noon: { id: 'noon', name: 'MEDIODÍA', desc: 'Sol alto y aire seco.' },
  dusk: { id: 'dusk', name: 'ATARDECER', desc: 'Luz dorada y sombras largas.' },
  storm: { id: 'storm', name: 'TORMENTA', desc: 'Lluvia, niebla y relámpagos.' },
  dawn: { id: 'dawn', name: 'ALBA', desc: 'Neblina fría del amanecer.' },
};

export const MAP_INFO = { id: 'varga', name: 'PUERTO VARGA', desc: 'Distrito industrial y portuario evacuado. Plaza central, mercado al oeste y almacenes al este.' };

// ---------------------------------------------------------------- PUNTUACIÓN
export const SCORE = {
  kill: 100, headshot: 50, assist: 30, capture: 150, captureAssist: 60, defend: 75,
  plant: 250, defuse: 250, roundWin: 200, objective: 300, streakKill: 25, revenge: 50, firstBlood: 75,
};

// ---------------------------------------------------------------- PROGRESIÓN
export const MAX_LEVEL = 30;
export function xpForLevel(lvl) { return 900 + lvl * 300; }

export const CHALLENGES = [
  { id: 'kills50', name: 'Primera línea', desc: 'Consigue 50 bajas.', stat: 'kills', goal: 50, xp: 1500 },
  { id: 'head25', name: 'Ojo de águila', desc: 'Consigue 25 disparos a la cabeza.', stat: 'headshots', goal: 25, xp: 2000 },
  { id: 'nade10', name: 'Granadero', desc: 'Elimina a 10 enemigos con explosivos.', stat: 'explosiveKills', goal: 10, xp: 1500 },
  { id: 'cap15', name: 'Toma de posiciones', desc: 'Captura 15 zonas en Dominio.', stat: 'captures', goal: 15, xp: 1500 },
  { id: 'plant5', name: 'Saboteador', desc: 'Planta o desactiva 5 cargas.', stat: 'objectives', goal: 5, xp: 1500 },
  { id: 'win10', name: 'Ganador nato', desc: 'Gana 10 partidas.', stat: 'wins', goal: 10, xp: 2500 },
  { id: 'streak12', name: 'Imparable', desc: 'Consigue una racha de 12 bajas. Recompensa: aspecto Élite dorado.', stat: 'bestStreak', goal: 12, xp: 3000, reward: 'skin:dorado' },
  { id: 'elite_win', name: 'Contra los mejores', desc: 'Gana una partida en dificultad ÉLITE. Recompensa: camuflaje Neón Vértice.', stat: 'eliteWins', goal: 1, xp: 3000, reward: 'camo:vertice' },
];

// ---------------------------------------------------------------- AJUSTES GRÁFICOS
export const QUALITY = {
  low: { id: 'low', name: 'BAJA', pixelRatio: 0.75, maxDpr: 1.0, shadows: false, shadowSize: 512, tex: 256, particles: 260, drawDist: 110, rain: 400, envMap: false, decals: 24 },
  medium: { id: 'medium', name: 'MEDIA', pixelRatio: 1.0, maxDpr: 1.5, shadows: true, shadowSize: 1024, tex: 512, particles: 600, drawDist: 160, rain: 900, envMap: true, decals: 48 },
  high: { id: 'high', name: 'ALTA', pixelRatio: 1.0, maxDpr: 2.0, shadows: true, shadowSize: 2048, tex: 1024, particles: 1100, drawDist: 220, rain: 1600, envMap: true, decals: 80 },
};

export const BOT_NAMES = [
  'Duarte', 'Sierra', 'Lobo', 'Quiroga', 'Vidal', 'Rocha', 'Navarro', 'Ferro', 'Cobalto', 'Prieto', 'Ibarra', 'Garza',
  'Montero', 'Saeta', 'Bravo', 'Cuervo', 'Halvor', 'Okoro', 'Brandt', 'Varela', 'Soto', 'Kaiser', 'Mirov', 'Yanez',
  'Lindo', 'Tejero', 'Arce', 'Pardo', 'Roble', 'Zafra',
];
