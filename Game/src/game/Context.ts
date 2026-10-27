import type { Scene } from 'three';
import type { Traffic } from '../ai/Traffic';
import type { Environment } from '../env/Environment';
import type { Profile } from '../progression/Profile';
import type { BodyStyle } from '../vehicles/BodyStyle';
import type { CarDef } from '../vehicles/CarCatalog';
import type { PartLevels, VisualConfig } from '../vehicles/Tuning';
import type { World } from '../world/World';
import type { Skills } from './Skills';
import type { Vehicle } from './Vehicle';

/** Services the gameplay modes (race sessions, free roam) use from the game. */
export interface GameContext {
  world: World;
  scene: Scene;
  env: Environment;
  quality: number;
  profile: Profile;
  traffic: Traffic;
  skills: Skills;
  player: Vehicle;
  spawnAI(def: CarDef, visual: VisualConfig, parts?: PartLevels, body?: BodyStyle): Vehicle;
  despawnAI(v: Vehicle): void;
  toast(kicker: string, value: string, extra?: string): void;
  bigMessage(text: string, ms?: number, cls?: string): void;
  sfx(name: string, gain?: number): void;
  resetPlayer(x: number, y: number, z: number, heading: number): void;
}
