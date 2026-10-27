import { EventBus } from '../core/EventBus';
import type { QualityName } from '../core/Quality';
import { LocalStorageBackend, SaveSystem, type StorageBackend } from '../save/SaveSystem';
import { CARS, getCar, STARTER_CAR } from '../vehicles/CarCatalog';
import { DEFAULT_TUNE, defaultVisual, partPrice, type FineTune, type PartLevels, type PartSlot, type VisualConfig } from '../vehicles/Tuning';

export const SAVE_VERSION = 1;

export interface OwnedCar {
  uid: string;
  carId: string;
  parts: PartLevels;
  /** Levels the player has bought per slot (installed level must be in here or 0). */
  owned: Partial<Record<PartSlot, number[]>>;
  tune: FineTune;
  visual: VisualConfig;
  odometer: number;
  bought: number;
}

export interface EventRecord {
  completed: boolean;
  bestPos: number;
  bestTime: number;
  bestScore: number;
  stars: number;
  attempts: number;
}

export interface Settings {
  quality: 'auto' | QualityName;
  resolution: number; // 0.5..1
  fps: 30 | 60;
  controls: 'buttons' | 'slider' | 'tilt';
  sensitivity: number;
  abs: boolean;
  tcs: boolean;
  stability: boolean;
  steerAssist: boolean;
  autoGear: boolean;
  volMaster: number;
  volEngine: number;
  volSfx: number;
  volMusic: number;
  units: 'kmh' | 'mph';
  lang: 'es' | 'en';
  camera: string;
  showFps: boolean;
  vibration: boolean;
  traffic: number; // density multiplier 0..1.5
  hudScale: number;
}

export interface ProfileData {
  version: number;
  created: number;
  updated: number;
  name: string;
  cash: number;
  xp: number;
  cars: OwnedCar[];
  current: string;
  events: Record<string, EventRecord>;
  zones: string[];
  pois: string[];
  eventsFound: string[];
  /** Explored road cells (keys "road:segment"). */
  roads: string[];
  stats: { distance: number; topSpeed: number; races: number; wins: number; drifts: number; bestDrift: number; nearMisses: number; airTime: number; pursuits: number; smashed: number };
  pos: { x: number; z: number; heading: number } | null;
  time: number;
  weather: string;
  settings: Settings;
  tutorial: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto', resolution: 1, fps: 60, controls: 'buttons', sensitivity: 0.55, abs: true, tcs: true, stability: true, steerAssist: true, autoGear: true,
  volMaster: 0.9, volEngine: 0.85, volSfx: 0.8, volMusic: 0.5, units: 'kmh', lang: (typeof navigator !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'es'),
  camera: 'chase', showFps: false, vibration: true, traffic: 1, hudScale: 1,
};

export function xpForLevel(level: number): number {
  // cumulative XP needed to reach `level` (level 1 = 0)
  let total = 0;
  for (let l = 1; l < level; l++) total += Math.round(800 * Math.pow(l, 1.35));
  return total;
}

export function levelFromXp(xp: number): number {
  let l = 1;
  while (xp >= xpForLevel(l + 1) && l < 99) l++;
  return l;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function newProfile(): ProfileData {
  const def = getCar(STARTER_CAR);
  const car: OwnedCar = { uid: uid(), carId: def.id, parts: {}, owned: {}, tune: { ...DEFAULT_TUNE }, visual: defaultVisual(def), odometer: 0, bought: Date.now() };
  return {
    version: SAVE_VERSION, created: Date.now(), updated: Date.now(), name: 'Piloto', cash: 25000, xp: 0, cars: [car], current: car.uid,
    events: {}, zones: [], pois: [], eventsFound: [], roads: [],
    stats: { distance: 0, topSpeed: 0, races: 0, wins: 0, drifts: 0, bestDrift: 0, nearMisses: 0, airTime: 0, pursuits: 0, smashed: 0 },
    pos: null, time: 9.5, weather: 'clear', settings: { ...DEFAULT_SETTINGS }, tutorial: false,
  };
}

export type ProfileEvents = {
  cash: { delta: number; reason: string };
  xp: { delta: number; reason: string };
  levelUp: { level: number; reward: number; unlocked: string[] };
  changed: void;
};

/**
 * Player profile: economy, garage, progress and settings with autosave.
 */
export class Profile {
  data: ProfileData;
  readonly bus = new EventBus<ProfileEvents>();
  private save: SaveSystem<ProfileData>;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private roadSet: Set<string>;
  readonly isNew: boolean;

  constructor(backend: StorageBackend = new LocalStorageBackend()) {
    this.save = new SaveSystem<ProfileData>(backend, 'motorworld_save', SAVE_VERSION, {});
    const loaded = this.save.load();
    this.isNew = !loaded;
    this.data = loaded ? this.sanitize(loaded) : newProfile();
    this.roadSet = new Set(this.data.roads);
    if (typeof window !== 'undefined') {
      const flush = () => this.flush();
      addEventListener('pagehide', flush);
      addEventListener('beforeunload', flush);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
      });
    }
    if (this.isNew) this.flush();
  }

  /** Repair any inconsistent data from older/corrupted saves. */
  private sanitize(d: ProfileData): ProfileData {
    const base = newProfile();
    const out = { ...base, ...d, settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) }, stats: { ...base.stats, ...(d.stats ?? {}) } };
    out.cars = (out.cars ?? []).filter((c) => CARS.some((x) => x.id === c.carId));
    if (!out.cars.length) out.cars = base.cars;
    for (const c of out.cars) {
      c.visual = { ...defaultVisual(getCar(c.carId)), ...(c.visual ?? {}) };
      c.tune = { ...DEFAULT_TUNE, ...(c.tune ?? {}) };
      c.parts = c.parts ?? {};
      c.owned = c.owned ?? {};
    }
    if (!out.cars.some((c) => c.uid === out.current)) out.current = out.cars[0].uid;
    if (!isFinite(out.cash)) out.cash = 0;
    if (!isFinite(out.xp)) out.xp = 0;
    return out;
  }

  get level() {
    return levelFromXp(this.data.xp);
  }
  get settings() {
    return this.data.settings;
  }
  get currentCar(): OwnedCar {
    return this.data.cars.find((c) => c.uid === this.data.current)!;
  }

  markDirty(immediate = false) {
    this.dirty = true;
    this.bus.emit('changed', undefined);
    if (immediate) return this.flush();
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 800);
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.data.updated = Date.now();
    this.data.roads = [...this.roadSet];
    const ok = this.save.save(this.data);
    if (ok) this.dirty = false;
    return ok;
  }

  get saveError() {
    return this.save.lastError;
  }

  addCash(delta: number, reason = '') {
    if (!delta) return;
    this.data.cash = Math.max(0, Math.round(this.data.cash + delta));
    this.bus.emit('cash', { delta, reason });
    this.markDirty();
  }

  addXp(delta: number, reason = '') {
    if (delta <= 0) return;
    const before = this.level;
    this.data.xp += Math.round(delta);
    this.bus.emit('xp', { delta, reason });
    const after = this.level;
    for (let l = before + 1; l <= after; l++) {
      const reward = 2000 + l * 1500;
      this.data.cash += reward;
      const unlocked = CARS.filter((c) => c.unlockLevel === l).map((c) => c.id);
      this.bus.emit('levelUp', { level: l, reward, unlocked });
    }
    this.markDirty();
  }

  canAfford(price: number) {
    return this.data.cash >= price;
  }

  ownsCar(carId: string) {
    return this.data.cars.some((c) => c.carId === carId);
  }

  buyCar(carId: string): OwnedCar | null {
    const def = getCar(carId);
    if (this.level < def.unlockLevel || !this.canAfford(def.price)) return null;
    this.data.cash -= def.price;
    const car: OwnedCar = { uid: uid(), carId, parts: {}, owned: {}, tune: { ...DEFAULT_TUNE }, visual: defaultVisual(def), odometer: 0, bought: Date.now() };
    this.data.cars.push(car);
    this.data.current = car.uid;
    this.bus.emit('cash', { delta: -def.price, reason: 'car' });
    this.markDirty(true);
    return car;
  }

  sellCar(uidToSell: string): number {
    if (this.data.cars.length <= 1) return 0;
    const car = this.data.cars.find((c) => c.uid === uidToSell);
    if (!car) return 0;
    const value = Math.round(getCar(car.carId).price * 0.6);
    this.data.cars = this.data.cars.filter((c) => c !== car);
    if (this.data.current === uidToSell) this.data.current = this.data.cars[0].uid;
    this.addCash(value, 'sell');
    this.markDirty(true);
    return value;
  }

  selectCar(u: string) {
    if (this.data.cars.some((c) => c.uid === u)) {
      this.data.current = u;
      this.markDirty();
    }
  }

  partOwned(car: OwnedCar, slot: PartSlot, level: number) {
    return level === 0 || (car.owned[slot] ?? []).includes(level);
  }

  /** Buy (if needed) and install a part level. Returns false if not affordable. */
  installPart(car: OwnedCar, slot: PartSlot, level: number): boolean {
    const def = getCar(car.carId);
    if (!this.partOwned(car, slot, level)) {
      const price = partPrice(def, slot, level);
      if (!this.canAfford(price)) return false;
      this.data.cash -= price;
      car.owned[slot] = [...(car.owned[slot] ?? []), level];
      this.bus.emit('cash', { delta: -price, reason: 'part' });
    }
    car.parts[slot] = level;
    this.markDirty(true);
    return true;
  }

  spend(price: number): boolean {
    if (!this.canAfford(price)) return false;
    this.data.cash -= price;
    this.bus.emit('cash', { delta: -price, reason: 'spend' });
    this.markDirty();
    return true;
  }

  recordEvent(id: string, result: { pos: number; time: number; score: number; finished: boolean }): { first: boolean; improved: boolean; stars: number } {
    const r = this.data.events[id] ?? { completed: false, bestPos: 99, bestTime: Infinity, bestScore: 0, stars: 0, attempts: 0 };
    r.attempts++;
    const first = result.finished && !r.completed;
    let improved = false;
    if (result.finished) {
      r.completed = true;
      if (result.pos < r.bestPos) {
        r.bestPos = result.pos;
        improved = true;
      }
      if (result.time > 0 && result.time < r.bestTime) {
        r.bestTime = result.time;
        improved = true;
      }
      if (result.score > r.bestScore) {
        r.bestScore = result.score;
        improved = true;
      }
    }
    const stars = result.finished ? (result.pos === 1 ? 3 : result.pos <= 3 ? 2 : 1) : 0;
    r.stars = Math.max(r.stars, stars);
    this.data.events[id] = { ...r, bestTime: isFinite(r.bestTime) ? r.bestTime : 0 };
    this.data.stats.races++;
    if (result.finished && result.pos === 1) this.data.stats.wins++;
    this.markDirty(true);
    return { first, improved, stars };
  }

  discover(kind: 'zones' | 'pois' | 'eventsFound', id: string): boolean {
    const list = this.data[kind];
    if (list.includes(id)) return false;
    list.push(id);
    this.markDirty();
    return true;
  }

  /** Track a driven road cell; returns true if newly explored. */
  exploreRoad(key: string): boolean {
    if (this.roadSet.has(key)) return false;
    this.roadSet.add(key);
    this.dirty = true;
    return true;
  }
  get roadsExplored() {
    return this.roadSet.size;
  }

  wipe() {
    this.save.wipe();
    this.data = newProfile();
    this.roadSet = new Set();
    this.flush();
  }
}
