import {
  ACESFilmicToneMapping, HalfFloatType, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Traffic } from '../ai/Traffic';
import { AudioEngine } from '../audio/AudioEngine';
import { CameraRig, type CamMode } from '../camera/CameraRig';
import { Input } from '../core/Input';
import { L, setLang, t } from '../core/i18n';
import { clamp } from '../core/MathUtil';
import { detectQuality, PerfMonitor, PROFILES, QUALITY_NAMES, type QualityName, type QualityProfile } from '../core/Quality';
import { Environment, type WeatherKind } from '../env/Environment';
import { CollisionSystem } from '../physics/CollisionSystem';
import { Surface, SURFACES } from '../physics/Surface';
import { Profile } from '../progression/Profile';
import { getEvent } from '../race/EventCatalog';
import { RaceSession, type RaceResult } from '../race/RaceSession';
import { GarageScene } from '../scenes/GarageScene';
import { haptic } from '../ui/dom';
import { Hud } from '../ui/hud/Hud';
import type { MapMarker } from '../ui/hud/Minimap';
import { EventsScreen } from '../ui/screens/EventsScreen';
import { DealerScreen, GarageScreen } from '../ui/screens/GarageScreens';
import { MapScreen } from '../ui/screens/MapScreen';
import { LoadingScreen, MainMenu, PauseScreen, ResultsScreen } from '../ui/screens/Menus';
import { SettingsScreen } from '../ui/screens/SettingsScreen';
import { UI } from '../ui/UI';
import type { BodyStyle } from '../vehicles/BodyStyle';
import { getCar, type CarDef } from '../vehicles/CarCatalog';
import { CLASS_ORDER, piToClass, quickPI } from '../vehicles/Performance';
import type { PartLevels, VisualConfig } from '../vehicles/Tuning';
import { Particles } from '../vfx/Particles';
import { Rain, SkidMarks, SpeedLines } from '../vfx/Effects';
import { MapRender } from '../world/MapRender';
import { RoadGraph } from '../world/RoadGraph';
import { World } from '../world/World';
import { POIS } from '../world/WorldDef';
import { generateWorld } from '../world/WorldGen';
import type { GameContext } from './Context';
import { Discovery, EVENT_COLORS, POI_COLORS } from './Discovery';
import type { GameApi } from './GameApi';
import { Skills } from './Skills';
import { Vehicle } from './Vehicle';

const STEP = 1 / 120;
const _v = new Vector3();
const _v2 = new Vector3();
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/**
 * Top-level game orchestrator: boot, main loop, modes (menu, free roam, events, garage),
 * physics stepping, systems update, rendering and UI wiring.
 */
export class Game implements GameContext, GameApi {
  renderer!: WebGLRenderer;
  scene = new Scene();
  camera = new PerspectiveCamera(62, 1, 0.3, 6000);
  env!: Environment;
  world!: World;
  input = new Input();
  rig!: CameraRig;
  collisions = new CollisionSystem();
  profile = new Profile();
  ui = new UI();
  audio = new AudioEngine();
  traffic!: Traffic;
  skills = new Skills();
  discovery!: Discovery;
  particles!: Particles;
  skids!: SkidMarks;
  rain!: Rain;
  speedLines!: SpeedLines;
  map!: MapRender;
  graph!: RoadGraph;
  hud!: Hud;
  garage!: GarageScene;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  perf = new PerfMonitor();
  player!: Vehicle;
  aiVehicles: Vehicle[] = [];
  race: RaceSession | null = null;
  lastResult: RaceResult | null = null;
  quality = 2;
  qp!: QualityProfile;
  private qualityName: QualityName = 'high';
  private acc = 0;
  private last = performance.now();
  private inMenu = true;
  private showGarage = false;
  private returnTo: () => void = () => this.toMenu();
  private gps: { x: number[]; z: number[] } | null = null;
  private gpsTarget: { x: number; z: number } | null = null;
  private savePosTimer = 0;
  private prevGear = 1;
  private prevBackfire = 0;
  private resultsTimer = 0;
  private lastEventId: string | null = null;
  private trafficAudioTimer = 0;
  private nitroWas = false;
  private ready = false;
  private pixelRatio = 1;
  private loading!: LoadingScreen;

  get inEvent() {
    return !!this.race;
  }

  // ===================================================================== boot
  async boot(container: HTMLElement) {
    setLang(this.profile.settings.lang);
    this.loading = new LoadingScreen();
    this.ui.register('loading', this.loading);
    this.ui.show('loading');
    // renderer (antialias decided once per launch)
    const probe = document.createElement('canvas').getContext('webgl2');
    const auto = detectQuality(probe);
    this.qualityName = this.profile.settings.quality === 'auto' ? auto : this.profile.settings.quality;
    this.qp = PROFILES[this.qualityName];
    this.quality = this.qp.level;
    this.renderer = new WebGLRenderer({ antialias: this.qp.antialias, powerPreference: 'high-performance', stencil: false });
    this.renderer.domElement.className = 'gl';
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.env = new Environment(this.renderer, this.scene);
    this.env.time = this.profile.data.time ?? 9.5;
    this.env.setWeather((this.profile.data.weather as WeatherKind) || 'clear');
    this.rig = new CameraRig(this.camera);
    this.rig.mode = (this.profile.settings.camera as CamMode) || 'chase';
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    this.resize();

    const data = await generateWorld((p, label) => this.loading.progress(p * 0.75, t('gen_' + label) || t('loading')));
    this.loading.progress(0.78, t('gen_world'));
    await new Promise((r) => setTimeout(r, 0));
    this.world = new World(data, this.scene);
    this.world.configure(this.quality, this.qp.shadows);
    this.world.onBreak = () => {};
    this.map = new MapRender(data, 1024);
    this.graph = new RoadGraph(data.roads);
    this.discovery = new Discovery(this.world, this.profile, this.scene);
    this.discovery.onToast = (k, v, r) => this.toast(k, v, r);
    this.discovery.onViewpoint = () => {
      this.rig.mode = 'cinematic';
      setTimeout(() => (this.rig.mode = (this.profile.settings.camera as CamMode) || 'chase'), 6000);
    };
    this.traffic = new Traffic(this.world, this.scene, PROFILES.ultra.traffic, this.quality);
    this.traffic.setCapacity(this.qp.traffic);
    this.traffic.events = {
      nearMiss: (_c, d) => {
        this.skills.add('near_miss', Math.round(250 + (4.2 - d) * 120 + this.player.sim.speed * 4));
        this.sfx('nearmiss');
        this.profile.data.stats.nearMisses++;
      },
      horn: () => this.sfx('horn', 0.6),
      crash: () => this.skills.crash(),
    };
    this.particles = new Particles(this.scene, this.qp.particles);
    this.skids = new SkidMarks(this.scene, this.quality >= 2 ? 2400 : 1200);
    this.rain = new Rain(this.scene, this.qp.rainDrops);
    this.speedLines = new SpeedLines(this.scene);
    this.loading.progress(0.86, t('gen_world'));
    // player
    this.spawnPlayerCar();
    const sp = this.startPosition();
    this.world.update(sp.x, sp.z, 1e9, true);
    this.resetPlayer(sp.x, sp.y, sp.z, sp.heading);
    this.loading.progress(0.95, t('gen_world'));
    // garage + UI
    this.garage = new GarageScene(this.renderer, this.quality);
    this.garage.resize(innerWidth, innerHeight);
    this.buildUI();
    this.skills.bus.on('banked', (b) => {
      this.profile.addXp(b.xp, 'skill');
      this.profile.addCash(b.cash, 'skill');
      this.toast(`${t('score')} x${b.mult.toFixed(1)}`, b.points.toLocaleString('en-US'), `+${b.xp} XP · +$${b.cash}`);
    });
    this.profile.bus.on('levelUp', (e) => {
      this.toast(t('level_up'), `${t('level')} ${e.level}`, `+$${e.reward.toLocaleString('en-US')}`);
      for (const id of e.unlocked) {
        const c = getCar(id);
        this.toast(t('car_unlocked'), `${c.brand} ${c.model}`);
      }
      this.sfx('levelup');
    });
    this.env.onLightning = (s) => setTimeout(() => this.sfx('thunder', s), 400 + Math.random() * 1600);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.savePosition();
        this.profile.flush();
        this.audio.suspend();
        if (this.ui.current === null && !this.inMenu) this.pause();
      } else this.audio.resume();
    });
    this.perf.target = this.profile.settings.fps;
    this.perf.onDowngrade = () => this.autoDowngrade();
    this.loading.progress(1, t('loading'));
    this.loading.ready();
    this.loading.onStart = async () => {
      try {
        await this.audio.start();
      } catch {
        /* audio unavailable */
      }
      this.applyAudioSettings();
      this.setupPlayerAudio();
      this.toMenu();
      try {
        await (screen.orientation as any)?.lock?.('landscape');
      } catch {
        /* not supported (desktop) */
      }
    };
    this.ready = true;
    (window as any).__game = this;
    (window as any).__ready = true;
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private buildUI() {
    const reg = (name: string, s: any) => this.ui.register(name, s);
    reg('menu', new MainMenu(this));
    reg('pause', new PauseScreen(this));
    reg('results', new ResultsScreen(this));
    const settings = new SettingsScreen(this);
    reg('settings', settings);
    const events = new EventsScreen(this);
    reg('events', events);
    const map = new MapScreen(this);
    reg('map', map);
    const dealer = new DealerScreen(this);
    reg('dealer', dealer);
    const garage = new GarageScreen(this);
    reg('garage', garage);
    for (const s of [settings, events, map, dealer, garage]) s.returnTo = () => this.returnTo();
    this.ui.onSound = (n) => this.sfx(n);
    this.hud = new Hud(this.map, this.input, {
      pause: () => this.pause(),
      camera: () => this.cycleCamera(),
      map: () => this.open('map'),
      reset: () => this.resetCar(),
    });
    this.hud.onPrompt = () => this.interact();
    this.ui.root.prepend(this.hud.el);
    this.hud.el.classList.add('hidden');
    this.applyControlSettings();
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.ui.current && this.ui.current !== 'loading' && this.ui.current !== 'menu') {
        if (!this.ui.back()) this.returnTo();
      }
    });
  }

  // ===================================================================== quality
  private applyQuality() {
    const r = this.renderer;
    const q = this.qp;
    this.pixelRatio = Math.min(devicePixelRatio || 1, q.pixelRatio) * this.profile.settings.resolution;
    r.setPixelRatio(this.pixelRatio * this.perf.scale);
    r.shadowMap.enabled = q.shadows;
    this.env.configureShadows(q.shadows, q.shadowMap, q.shadowExtent);
    if (q.post) {
      if (!this.composer) {
        this.composer = new EffectComposer(r);
        this.composer.renderTarget1.texture.type = HalfFloatType;
        this.composer.renderTarget2.texture.type = HalfFloatType;
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.5, 0.92);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
      }
    } else if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloom = null;
    }
    this.world?.configure(this.quality, q.shadows);
    this.traffic?.setCapacity(Math.round(q.traffic * this.profile.settings.traffic));
    if (this.particles) this.particles.budget = this.quality === 0 ? 0.5 : 1;
    this.resize();
  }

  private autoDowngrade() {
    if (this.profile.settings.quality !== 'auto') return;
    const i = QUALITY_NAMES.indexOf(this.qualityName);
    if (i <= 0) return;
    this.qualityName = QUALITY_NAMES[i - 1];
    this.qp = PROFILES[this.qualityName];
    this.quality = this.qp.level;
    this.perf.scale = 0.9;
    this.applyQuality();
  }

  private resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.pixelRatio * this.perf.scale);
    this.garage?.resize(w, h);
    this.particles?.setViewportHeight(h * this.pixelRatio);
  }

  // ===================================================================== settings
  applySettings(reload = false) {
    const s = this.profile.settings;
    if (reload || s.lang !== (document.documentElement.lang as any)) {
      this.profile.flush();
      location.reload();
      return;
    }
    const want = s.quality === 'auto' ? this.qualityName : s.quality;
    if (want !== this.qualityName || true) {
      this.qualityName = want as QualityName;
      this.qp = PROFILES[this.qualityName];
      this.quality = this.qp.level;
      this.applyQuality();
    }
    this.perf.target = s.fps;
    this.applyAudioSettings();
    this.applyControlSettings();
    this.player.setAssists({ abs: s.abs, tcs: s.tcs, stability: s.stability, steering: s.steerAssist, autoGear: s.autoGear });
  }

  private applyAudioSettings() {
    const s = this.profile.settings;
    this.audio.volumes = { master: s.volMaster, engine: s.volEngine, sfx: s.volSfx, music: s.volMusic };
    this.audio.applyVolumes();
  }

  private applyControlSettings() {
    const s = this.profile.settings;
    this.input.sensitivity = s.sensitivity;
    this.hud.touch.setMode(s.controls);
    this.hud.touch.setManual(!s.autoGear);
    this.hud.touch.vibration = s.vibration;
    this.hud.setScale(s.hudScale);
  }

  // ===================================================================== vehicles
  private spawnPlayerCar() {
    const oc = this.profile.currentCar;
    const def = getCar(oc.carId);
    const old = this.player;
    this.player = new Vehicle(def, oc.parts, oc.visual, oc.tune, this.world, this.scene, this.quality, this.qp.carLights);
    const s = this.profile.settings;
    this.player.setAssists({ abs: s.abs, tcs: s.tcs, stability: s.stability, steering: s.steerAssist, autoGear: s.autoGear });
    if (old) {
      this.player.sim.reset(old.sim.position.x, old.sim.position.y + 0.3, old.sim.position.z, old.sim.heading);
      old.dispose();
    }
    if (this.env.envTexture) this.player.model.setEnvMap(this.env.envTexture);
    this.setupPlayerAudio();
  }

  private setupPlayerAudio() {
    if (!this.audio.started || !this.player) return;
    const e = this.player.sim.spec.engine;
    this.audio.setPlayerEngine(this.player.def.sound, e.cylinders, e.turbo ? 1 : 0);
  }

  setPlayerCar(uid: string) {
    this.profile.selectCar(uid);
    this.spawnPlayerCar();
  }

  refreshPlayerCar() {
    const oc = this.profile.currentCar;
    if (oc.carId !== this.player.def.id) return this.spawnPlayerCar();
    this.player.rebuild(oc.parts, oc.visual, oc.tune);
    if (this.env.envTexture) this.player.model.setEnvMap(this.env.envTexture);
    this.setupPlayerAudio();
  }

  spawnAI(def: CarDef, visual: VisualConfig, parts: PartLevels = {}, body?: BodyStyle): Vehicle {
    const d = body ? { ...def, body } : def;
    const v = new Vehicle(d, parts, visual, undefined, this.world, this.scene, Math.min(this.quality, 1), false);
    v.setAssists({ abs: true, tcs: true, stability: true, steering: false, autoGear: true });
    this.aiVehicles.push(v);
    return v;
  }

  despawnAI(v: Vehicle) {
    v.dispose();
    this.aiVehicles = this.aiVehicles.filter((x) => x !== v);
  }

  resetPlayer(x: number, y: number, z: number, heading: number) {
    this.player.sim.reset(x, y + 1.0, z, heading);
    this.skids.break();
    this.rig.snap(this.player);
  }

  private startPosition() {
    const p = this.profile.data.pos;
    if (p) {
      const sp = this.world.spawnOnRoad(p.x, p.z);
      if (Math.hypot(sp.x - p.x, sp.z - p.z) < 40) return { ...sp, heading: p.heading };
      return sp;
    }
    const g = POIS.find((q) => q.id === 'garage_city')!;
    return this.world.spawnOnRoad(g.x, g.z + 60);
  }

  playerPos() {
    const s = this.player.sim;
    return { x: s.position.x, z: s.position.z, heading: s.heading };
  }

  // ===================================================================== modes
  toMenu() {
    if (this.race) this.endRace();
    this.inMenu = true;
    this.showGarage = false;
    this.hud.el.classList.add('hidden');
    this.rig.mode = 'orbit';
    this.rig.orbitDist = 7.5;
    this.rig.orbitHeight = 1.6;
    this.returnTo = () => this.toMenu();
    this.ui.show('menu');
  }

  play() {
    this.inMenu = false;
    this.showGarage = false;
    this.ui.show(null);
    this.hud.el.classList.remove('hidden');
    this.rig.mode = (this.profile.settings.camera as CamMode) || 'chase';
    this.rig.snap(this.player);
    if (!this.profile.data.tutorial) {
      this.profile.data.tutorial = true;
      setTimeout(() => this.toast('TIP', t('tutorial_1')), 800);
      setTimeout(() => this.toast('TIP', t('tutorial_2')), 5000);
    }
  }

  pause() {
    if (this.inMenu) return;
    this.returnTo = () => this.ui.show('pause');
    this.ui.show('pause');
  }

  resume() {
    this.showGarage = false;
    this.ui.show(null);
    this.hud.el.classList.remove('hidden');
  }

  open(screen: 'garage' | 'dealer' | 'events' | 'map' | 'settings') {
    if (!this.inMenu && this.ui.current === null) this.returnTo = () => this.resume();
    else if (!this.inMenu && this.ui.current === 'pause') this.returnTo = () => this.ui.show('pause');
    else if (this.inMenu) this.returnTo = () => this.toMenu();
    if ((screen === 'garage' || screen === 'dealer') && this.race) return;
    this.showGarage = screen === 'garage' || screen === 'dealer';
    if (screen === 'map' || screen === 'events') this.showGarage = false;
    const back = this.returnTo;
    this.returnTo = () => {
      this.showGarage = false;
      back();
    };
    this.ui.show(screen);
  }

  closeOverlay() {
    this.returnTo();
  }

  cycleCamera() {
    this.rig.next();
    this.profile.settings.camera = this.rig.mode;
    this.profile.markDirty();
  }

  resetCar() {
    if (this.race) this.race.resetPlayer();
    else {
      const s = this.player.sim;
      const sp = this.world.spawnOnRoad(s.position.x, s.position.z);
      this.resetPlayer(sp.x, sp.y, sp.z, sp.heading);
    }
    if (this.ui.current === 'pause') this.resume();
  }

  travelTo(x: number, z: number) {
    const sp = this.world.spawnOnRoad(x, z);
    this.world.update(sp.x, sp.z, 1e9, true);
    this.resetPlayer(sp.x, sp.y, sp.z, sp.heading);
    this.traffic.clear();
    this.inMenu = false;
    this.play();
  }

  setGps(x: number, z: number) {
    const p = this.player.sim.position;
    this.gps = this.graph.route(p.x, p.z, x, z);
    this.gpsTarget = { x, z };
  }

  setWeather(w: string) {
    this.env.setWeather(w as WeatherKind);
    this.profile.data.weather = w;
    this.profile.markDirty();
  }

  setTime(h: number) {
    this.env.time = h;
    this.profile.data.time = h;
  }

  sound(name: string) {
    this.sfx(name);
  }

  sfx(name: string, gain = 1) {
    this.audio.play(name, gain);
  }

  toast(k: string, v: string, r?: string) {
    this.hud?.toast(k, v, r);
    this.sfx('toast');
  }

  bigMessage(text: string, ms = 1200, cls = '') {
    this.hud.big(text, ms, cls);
  }

  testDrive() {
    this.showGarage = false;
    this.refreshPlayerCar();
    const s = this.player.sim;
    const strip = this.world.data.roads.byId('strip');
    const i = 30;
    this.world.update(strip.px[i], strip.pz[i], 1e9, true);
    this.resetPlayer(strip.px[i], strip.py[i], strip.pz[i], Math.atan2(-strip.tx[i], -strip.tz[i]));
    void s;
    this.inMenu = false;
    this.play();
  }

  private interact() {
    const it = this.discovery.interaction;
    if (!it) return;
    if (it.kind === 'event') this.startEvent(it.id);
    else if (it.kind === 'garage') this.open('garage');
    else if (it.kind === 'gas') {
      this.player.sim.nitroAmount = 1;
      this.toast(t('gas_station'), t('refuel'));
    }
  }

  // ===================================================================== events
  async startEvent(id: string) {
    const def = getEvent(id);
    if (this.profile.level < def.minLevel) return;
    if (def.maxClass) {
      const cls = piToClass(quickPI(this.player.sim.spec));
      if (CLASS_ORDER.indexOf(cls) > CLASS_ORDER.indexOf(def.maxClass)) {
        await this.ui.alert(t('requirements'), `${t('class_max')} ${def.maxClass} · ${t('current_car')}: ${cls}`);
        return;
      }
    }
    if (this.race) this.endRace();
    this.lastEventId = id;
    this.inMenu = false;
    this.showGarage = false;
    // make sure the start area is streamed in
    const st = this.discovery.starts.find((s) => s.def.id === id)!;
    this.world.update(st.x, st.z, 1e9, true);
    this.race = new RaceSession(this, def);
    this.race.onFinish = (r) => {
      this.lastResult = r;
      this.resultsTimer = 2.5;
      this.bigMessage(r.finished ? (r.event.rivals > 0 ? `${r.position}º` : t('finished')) : r.reason ?? t('failed'), 2200);
    };
    if (def.time !== undefined) this.env.time = def.time;
    if (def.weather) this.env.setWeather(def.weather);
    this.gps = null;
    this.ui.show(null);
    this.hud.el.classList.remove('hidden');
    this.rig.mode = (this.profile.settings.camera as CamMode) || 'chase';
    this.rig.snap(this.player);
    this.toast(t(def.type), L(def.name));
  }

  retryEvent() {
    const id = this.lastEventId;
    if (this.race) this.endRace();
    if (id) this.startEvent(id);
  }

  quitEvent() {
    const st = this.race ? this.discovery.starts.find((s) => s.def.id === this.race!.def.id) : null;
    if (this.race) this.endRace();
    if (st) {
      const sp = this.world.spawnOnRoad(st.x + 30, st.z + 30);
      this.resetPlayer(sp.x, sp.y, sp.z, sp.heading);
    }
    this.env.setWeather((this.profile.data.weather as WeatherKind) || 'clear');
    this.resume();
  }

  private endRace() {
    this.race?.dispose();
    this.race = null;
    this.audio.siren(false);
    this.resultsTimer = 0;
  }

  // ===================================================================== loop
  private frameErrors = 0;
  private frame() {
    try {
      this.frameInner();
    } catch (e) {
      // never let one bad frame kill the game loop; report the first few
      if (this.frameErrors++ < 5) console.error(e);
    }
  }

  private frameInner() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.ready) return;
    if (this.perf.tick(dt)) {
      this.renderer.setPixelRatio(this.pixelRatio * this.perf.scale);
      this.composer?.setPixelRatio(this.pixelRatio * this.perf.scale);
    }
    this.input.update(dt);
    this.ui.update(dt);
    if (this.showGarage) {
      this.garage.update(dt);
      const exp = this.renderer.toneMappingExposure;
      this.renderer.toneMappingExposure = 1.0;
      this.renderer.render(this.garage.scene, this.garage.camera);
      this.renderer.toneMappingExposure = exp;
      return;
    }
    const driving = this.ui.current === null && !this.inMenu;
    this.handleActions(driving);
    const sim = this.player.sim;
    if (driving) {
      this.controlPlayer();
      if (this.race) this.race.update(dt);
      this.acc += dt;
      let steps = 0;
      const sims = [sim, ...this.aiVehicles.map((v) => v.sim)];
      const bodies = this.traffic.activeBodies;
      while (this.acc >= STEP && steps < 8) {
        for (const s of sims) s.step(STEP);
        this.collisions.resolve(sims, bodies, this.world);
        this.handleImpacts();
        this.acc -= STEP;
        steps++;
      }
      if (steps === 8) this.acc = 0;
      const f = sim.getForward(_v);
      this.traffic.night = this.env.night;
      this.traffic.rainFactor = 1 - this.env.wetness * 0.15;
      this.traffic.density = this.profile.settings.traffic;
      this.traffic.update(dt, { x: sim.position.x, y: sim.position.y, z: sim.position.z, vx: sim.velocity.x, vz: sim.velocity.z, fx: f.x, fz: f.z, speed: sim.speed }, this.aiVehicles.map((v) => ({ x: v.sim.position.x, z: v.sim.position.z })));
      this.skills.driftBoost = this.race?.def.type === 'drift' ? 1.3 : this.discovery.inDriftZone ? 1.6 : 1;
      this.skills.update(dt, sim);
      this.discovery.update(dt, sim.position.x, sim.position.y, sim.position.z, sim.speed, !!this.race);
      this.hud.setPrompt(this.discovery.interaction?.label ?? null);
      this.updateStats(dt);
      if (this.resultsTimer > 0) {
        this.resultsTimer -= dt;
        if (this.resultsTimer <= 0) {
          this.ui.show('results');
          this.hud.el.classList.add('hidden');
        }
      }
      // sirens
      if (this.race?.police.length) {
        const d = Math.min(...this.race.police.map((p) => p.v.sim.position.distanceTo(sim.position)));
        this.audio.siren(true, clamp(1 - d / 250, 0.15, 1));
      }
    }
    this.discovery.setVisible(!this.inMenu);
    // visuals
    for (const v of [this.player, ...this.aiVehicles]) v.sync(this.env.night);
    this.effects(dt, driving);
    // camera
    if (this.inMenu) this.rig.mode = 'orbit';
    this.rig.lookBack = this.input.key('KeyB');
    this.rig.update(dt, this.player, this.world);
    this.env.sky.mesh.position.copy(this.camera.position);
    this.env.update(dt, this.camera.position.clone().lerp(sim.position, 0.7), this.quality);
    if (this.env.envTexture && this.player.model.mats.paint.envMap !== this.env.envTexture) {
      for (const v of [this.player, ...this.aiVehicles]) v.model.setEnvMap(this.env.envTexture);
    }
    this.world.setNight(this.env.night);
    this.world.setWetness(this.env.wetness);
    this.world.update(sim.position.x, sim.position.z, driving ? 5 : 10);
    if (this.bloom) this.bloom.strength = 0.22 + this.env.night * 0.45;
    // audio
    this.updateAudio(dt, driving);
    // hud
    if (driving || this.resultsTimer > 0) this.updateHud(dt);
    // render
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private handleActions(driving: boolean) {
    const inp = this.input;
    if (inp.consume('pause') && driving) this.pause();
    if (!driving) {
      inp.clearActions();
      return;
    }
    if (inp.consume('camera')) this.cycleCamera();
    if (inp.consume('map')) this.open('map');
    if (inp.consume('reset')) this.resetCar();
    if (inp.consume('horn')) this.sfx('horn');
    if (inp.consume('interact')) this.interact();
    const s = this.player.sim.input;
    if (inp.consume('shiftUp')) s.shiftUp = true;
    if (inp.consume('shiftDown')) s.shiftDown = true;
  }

  private controlPlayer() {
    const s = this.player.sim;
    const inp = this.input;
    const countdown = this.race?.state === 'countdown';
    const finished = this.race?.state === 'finished';
    if (finished) {
      // autopilot coast after the finish line
      s.input.throttle = 0;
      s.input.brake = 0.3;
      s.input.steer = inp.steer * 0.5;
      return;
    }
    s.input.throttle = inp.throttle;
    s.input.brake = countdown ? 1 : inp.brake;
    s.input.steer = inp.steer;
    s.input.handbrake = countdown ? true : inp.handbrake;
    s.input.nitro = inp.nitro;
    // nitro regenerates slowly + with skills
    if (s.spec.nitro > 0 && !s.powertrain.nitroActive) s.nitroAmount = Math.min(1, s.nitroAmount + (this.skills.points > 0 ? 0.03 : 0.006) * (1 / 60));
  }

  private handleImpacts() {
    for (const im of this.collisions.impacts) {
      const isPlayer = im.sim === this.player.sim;
      const near = im.sim.position.distanceTo(this.camera.position) < 60;
      if (im.speed > 3 && near) {
        _v.set(im.x, im.y, im.z);
        for (let k = 0; k < Math.min(18, im.speed * 2); k++) this.particles.emit('spark', _v, im.sim.velocity, 1);
        if (im.speed > 8) for (let k = 0; k < 6; k++) this.particles.emit('debris', _v, im.sim.velocity, 1);
        this.sfx('impact', clamp(im.speed / 20, 0.15, 1) * (isPlayer ? 1 : 0.5));
      }
      if (isPlayer && im.speed > 5) {
        this.rig.addShake(clamp(im.speed / 15, 0.2, 1.2));
        this.skills.crash();
        this.skids.break();
        if (this.profile.settings.vibration) haptic(Math.min(80, im.speed * 4));
        if (im.speed > 12) this.hud.flash();
      }
    }
  }

  private effects(dt: number, driving: boolean) {
    const night = this.env.night;
    const wet = this.env.wetness;
    for (const v of [this.player, ...this.aiVehicles]) {
      const s = v.sim;
      if (s.position.distanceToSquared(this.camera.position) > 120 * 120) continue;
      const isPlayer = v === this.player;
      s.getRight(_v2);
      for (const w of s.wheels) {
        if (!w.contact) {
          if (isPlayer) this.skids.add(w.index, w.contactPoint, _v2.x, _v2.z, 0.25, 0);
          continue;
        }
        const surf = SURFACES[w.surface];
        const slip = w.slip;
        const spd = Math.abs(w.groundSpeed);
        if (!driving) continue;
        if (!surf.dusty) {
          if (slip > 1.5 && (spd > 2 || Math.abs(w.omega * w.radius) > 5) && wet < 0.5) {
            const rate = clamp((slip - 1.4) * 0.6, 0, 1.2) * dt * 60;
            for (let k = 0; k < rate; k++) if (Math.random() < 0.5) this.particles.emit('smoke', w.contactPoint, s.velocity, clamp(slip / 2, 0.4, 1.4));
          }
          const mark = slip > 1.0 || (w.brakeTorque > 0 && w.omega === 0 && spd > 2) ? clamp((slip - 0.9) * 1.5, 0.3, 1) : 0;
          if (isPlayer || this.quality >= 2) this.skids.add(w.index + (isPlayer ? 0 : 0), w.contactPoint, _v2.x, _v2.z, (w.front ? v.def.body.tireWidthF : v.def.body.tireWidthR), isPlayer ? mark : 0);
          if (wet > 0.4 && spd > 12 && Math.random() < wet * 0.6) this.particles.emit('spray', w.contactPoint, s.velocity, wet);
        } else {
          if (isPlayer) this.skids.add(w.index, w.contactPoint, _v2.x, _v2.z, 0.2, 0);
          if (spd > 4 && Math.random() < clamp(spd / 30 + slip * 0.3, 0, 1) * (w.front ? 0.3 : 0.7)) this.particles.emit('dust', w.contactPoint, s.velocity, 1, surf.dustColor);
        }
      }
      if (!driving) continue;
      // exhaust: backfire pops and nitro flames
      const pt = s.powertrain;
      const exhaust = _v.set(0, 0, 0).copy(v.model.bodyGroup.position).add(new Vector3(v.def.body.width * 0.2, v.def.body.clearance + 0.1, v.model.profile.zAt(1) + 0.1)).applyQuaternion(s.quaternion).add(s.position);
      if (isPlayer && pt.backfire !== this.prevBackfire) {
        this.prevBackfire = pt.backfire;
        if (Math.random() < 0.7 + v.parts.exhaust! * 0.1 || (v.parts.exhaust ?? 0) >= 2) {
          for (let k = 0; k < 4; k++) this.particles.emit('flame', exhaust, s.velocity, 1.2);
          this.sfx('backfire', 0.6 + (v.parts.exhaust ?? 0) * 0.15);
        }
      }
      if (pt.nitroActive) for (let k = 0; k < 2; k++) this.particles.emit('flame', exhaust, s.velocity, 1.4, 1);
      if (isPlayer && s.scrape > 0.3 && s.speed > 5) this.particles.emit('spark', s.position.clone().setY(s.position.y - s.spec.chassis.cgHeight + 0.1), s.velocity);
    }
    this.particles.update(dt);
    this.rain.update(dt, this.camera, this.env.rain, 0.4 + (1 - night) * 0.6);
    const spd = this.player.sim.speed;
    this.speedLines.update(dt, driving ? clamp((spd - 50) / 30, 0, 1) * 0.6 + (this.player.sim.powertrain.nitroActive ? 0.5 : 0) : 0, this.player.sim.powertrain.nitroActive);
  }

  private updateAudio(dt: number, driving: boolean) {
    if (!this.audio.started) return;
    const s = this.player.sim;
    const pt = s.powertrain;
    const e = s.spec.engine;
    let slip = 0, loose = 0;
    for (const w of s.wheels) {
      if (!w.contact) continue;
      const surf = SURFACES[w.surface];
      if (surf.sound === 'tarmac') slip = Math.max(slip, clamp((w.slip - 0.9) * 1.1, 0, 1) * clamp(Math.abs(w.groundSpeed) / 4 + Math.abs(w.omega * w.radius - w.groundSpeed) / 6, 0, 1));
      else loose = Math.max(loose, 1);
    }
    const zone = this.discovery.currentZone;
    const interior = this.rig.mode === 'cockpit';
    this.audio.update({
      engine: driving || this.inMenu ? { rpm: pt.rpm, throttle: this.inMenu ? 0 : s.input.throttle, load: pt.load, boost: e.turbo ? pt.boost / e.turbo.maxBoost : 0, redline: e.redline } : null,
      speed: s.speed, slip: driving ? slip : 0, loose: driving ? loose : 0, scrape: driving ? s.scrape : 0, interior, rain: this.env.rain,
      city: zone === 'city' || zone === 'port' ? 1 : 0.15, coast: s.position.x > 1300 ? 1 : 0, nature: zone === 'forest' || zone === 'sierra' || zone === 'fields' || zone === 'valley' ? 1 : 0.2,
      night: this.env.night, paused: !driving && !this.inMenu,
    });
    if (driving) {
      if (pt.shiftEvent) this.sfx('shift');
      if (pt.blowOff > 0.3) this.sfx('blowoff', pt.blowOff);
      if (pt.nitroActive && !this.nitroWas) this.sfx('nitro');
      this.nitroWas = pt.nitroActive;
      if (pt.gear !== this.prevGear) this.prevGear = pt.gear;
      this.trafficAudioTimer -= dt;
      if (this.trafficAudioTimer <= 0) {
        this.trafficAudioTimer = 0.1;
        const cam = this.camera;
        const right = _v.set(1, 0, 0).applyQuaternion(cam.quaternion);
        const cars = this.traffic.nearest(cam.position.x, cam.position.z, 3).map((c) => {
          const dx = c.x - cam.position.x, dz = c.z - cam.position.z;
          const dist = Math.hypot(dx, dz);
          const approach = -((c.vx - s.velocity.x) * dx + (c.vz - s.velocity.z) * dz) / Math.max(1, dist);
          return { dist, pan: (dx * right.x + dz * right.z) / Math.max(1, dist), speed: c.speed, approach };
        });
        this.audio.updateTraffic(cars, false);
      }
    } else this.audio.updateTraffic([], true);
  }

  private updateHud(dt: number) {
    const s = this.player.sim;
    const pt = s.powertrain;
    const markers: MapMarker[] = [];
    for (const st of this.discovery.starts) if (this.discovery.isKnown(st.def.id) && !this.race) markers.push({ x: st.x, z: st.z, color: hex(EVENT_COLORS[st.def.type]), shape: 'diamond', size: 5 });
    for (const p of POIS) if (p.kind === 'garage' || this.profile.data.pois.includes(p.id)) markers.push({ x: p.x, z: p.z, color: hex(POI_COLORS[p.kind] ?? 0xffffff), shape: p.kind === 'garage' ? 'square' : 'dot', size: 4 });
    if (this.gpsTarget) {
      markers.push({ x: this.gpsTarget.x, z: this.gpsTarget.z, color: '#ffffff', shape: 'diamond', size: 6 });
      if (Math.hypot(this.gpsTarget.x - s.position.x, this.gpsTarget.z - s.position.z) < 40) {
        this.gps = null;
        this.gpsTarget = null;
      }
    }
    const race = this.race;
    if (race) {
      const cp = race.hud().nextCp;
      if (cp) markers.push({ x: cp.x, z: cp.z, color: '#e01a2b', shape: 'ring', size: 5 });
    }
    this.skills.window && this.hud.skill(this.skills.points > 0 ? this.skills.last : null, this.skills.points, this.skills.mult, this.skills.timer, this.skills.window);
    this.hud.update(dt, {
      speed: s.forwardSpeed, rpm: pt.rpm, redline: s.spec.engine.redline, gear: pt.gear, shifting: pt.shifting, nitro: s.nitroAmount, nitroFitted: s.spec.nitro > 0,
      units: this.profile.settings.units, x: s.position.x, z: s.position.z, heading: s.heading, zone: this.discovery.zoneName(), clock: this.env.clock,
      cash: this.profile.data.cash, markers, route: race ? { x: race.route.x, z: race.route.z } : this.gps, others: race ? race.dots : [],
      race: race ? race.hud() : null, fps: this.profile.settings.showFps ? this.perf.fps : null,
    });
  }

  private updateStats(dt: number) {
    const s = this.player.sim;
    const st = this.profile.data.stats;
    st.distance += s.speed * dt;
    this.profile.currentCar.odometer += s.speed * dt;
    st.topSpeed = Math.max(st.topSpeed, s.forwardSpeed * 3.6);
    if (s.airTime > 0) st.airTime += dt;
    this.savePosTimer += dt;
    if (this.savePosTimer > 5) {
      this.savePosTimer = 0;
      this.savePosition();
    }
  }

  private savePosition() {
    if (!this.player || this.race) return;
    const s = this.player.sim;
    this.profile.data.pos = { x: s.position.x, z: s.position.z, heading: s.heading };
    this.profile.data.time = this.env.time;
    this.profile.markDirty();
  }
}

export { Surface };
