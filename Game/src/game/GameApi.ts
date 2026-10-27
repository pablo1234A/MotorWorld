import type { AudioEngine } from '../audio/AudioEngine';
import type { Environment } from '../env/Environment';
import type { Profile } from '../progression/Profile';
import type { RaceResult } from '../race/RaceSession';
import type { GarageScene } from '../scenes/GarageScene';
import type { UI } from '../ui/UI';
import type { MapRender } from '../world/MapRender';
import type { Discovery } from './Discovery';

/** What the UI screens can ask the game to do. */
export interface GameApi {
  profile: Profile;
  ui: UI;
  audio: AudioEngine;
  env: Environment;
  map: MapRender;
  discovery: Discovery;
  garage: GarageScene;
  lastResult: RaceResult | null;
  inEvent: boolean;
  playerPos(): { x: number; z: number; heading: number };
  play(): void;
  toMenu(): void;
  open(screen: 'garage' | 'dealer' | 'events' | 'map' | 'settings'): void;
  closeOverlay(): void;
  startEvent(id: string): void;
  retryEvent(): void;
  quitEvent(): void;
  resume(): void;
  resetCar(): void;
  applySettings(reloadNeeded?: boolean): void;
  setPlayerCar(uid: string): void;
  refreshPlayerCar(): void;
  testDrive(): void;
  travelTo(x: number, z: number): void;
  setGps(x: number, z: number): void;
  setWeather(w: string): void;
  setTime(h: number): void;
  sound(name: string): void;
}
