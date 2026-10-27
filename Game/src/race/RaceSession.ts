import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, TorusGeometry, Vector3 } from 'three';
import { PoliceAI } from '../ai/PoliceAI';
import { makeProfiles, RacerAI, type DriverProfile } from '../ai/RacerAI';
import { clamp } from '../core/MathUtil';
import { Rng } from '../core/Random';
import { L, t } from '../core/i18n';
import type { GameContext } from '../game/Context';
import type { Vehicle } from '../game/Vehicle';
import { CARS, getCar, POLICE_BODY, type CarDef } from '../vehicles/CarCatalog';
import { CLASS_ORDER, computeStats, piToClass, quickPI, type CarClass } from '../vehicles/Performance';
import { defaultVisual, PARTS, type PartLevels } from '../vehicles/Tuning';
import type { EventDef } from './EventCatalog';
import { Route } from './Route';

export interface Racer {
  name: string;
  vehicle: Vehicle;
  ai: RacerAI | null;
  isPlayer: boolean;
  idx: number;
  lap: number;
  progress: number;
  finishTime: number;
  cp: number;
  color: string;
}

export interface Standing {
  name: string;
  car: string;
  time: number;
  isPlayer: boolean;
  dnf: boolean;
}

export interface RaceResult {
  event: EventDef;
  finished: boolean;
  position: number;
  time: number;
  score: number;
  standings: Standing[];
  cash: number;
  xp: number;
  stars: number;
  first: boolean;
  reason?: string;
}

export interface RaceHud {
  position: number;
  total: number;
  lap: number;
  laps: number;
  time: number;
  timer: number | null;
  score: number | null;
  objective: string;
  wrongWay: boolean;
  nextCp: Vector3 | null;
  heat: number;
  busted: number;
}

type State = 'countdown' | 'racing' | 'finished';

/**
 * A running event: grid, countdown, AI rivals, progress/positions, laps, checkpoints,
 * mode rules (sprint, circuit, time trial, top speed, drift, pursuit, checkpoint run) and results.
 */
export class RaceSession {
  readonly route: Route;
  readonly racers: Racer[] = [];
  readonly police: { v: Vehicle; ai: PoliceAI }[] = [];
  state: State = 'countdown';
  countdown = 3.6;
  time = 0;
  private startDist: number;
  private gate: Group;
  private wrongTimer = 0;
  timer = 0;
  maxSpeed = 0;
  busted = 0;
  private escapeTimer = 0;
  result: RaceResult | null = null;
  onFinish?: (r: RaceResult) => void;
  private player!: Racer;
  private lastShown = 4;
  private cpBonus: number[] = [];
  /** Player's car class at start (for display). */
  playerClass: CarClass;

  constructor(private ctx: GameContext, readonly def: EventDef, difficultyOverride?: number) {
    const w = ctx.world;
    this.route = new Route(w.data.roads, def.legs, def.closed, def.type === 'checkpoints' ? 320 : 250);
    const rows = Math.ceil((def.rivals + 1) / 2);
    this.startDist = 8 + rows * 9;
    const diff = difficultyOverride ?? def.difficulty;
    const stats = { pi: quickPI(ctx.player.sim.spec), cls: piToClass(quickPI(ctx.player.sim.spec)) };
    this.playerClass = stats.cls;
    // grid
    const n = def.rivals + 1;
    const playerSlot = def.rivals === 0 ? 0 : diff >= 3 ? n - 1 : Math.floor(n / 2);
    const profiles: DriverProfile[] = makeProfiles(def.rivals, diff, def.id.length * 7 + def.rivals);
    const rng = new Rng(def.id.length * 999 + Date.now() % 1000);
    const colors = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1'];
    let ai = 0;
    for (let slot = 0; slot < n; slot++) {
      const pos = this.gridPos(slot);
      if (slot === playerSlot) {
        ctx.resetPlayer(pos.x, pos.y, pos.z, pos.heading);
        this.player = { name: ctx.profile.data.name, vehicle: ctx.player, ai: null, isPlayer: true, idx: pos.i, lap: 0, progress: 0, finishTime: 0, cp: 0, color: '#ffffff' };
        this.racers.push(this.player);
      } else {
        const p = profiles[ai++];
        const { def: cdef, parts } = this.pickRivalCar(stats.pi, rng, diff);
        const vis = defaultVisual(cdef);
        vis.color = parseInt(colors[ai % colors.length].slice(1), 16);
        vis.vinyl = [1, 2, 4, 3][ai % 4];
        vis.raceNumber = 10 + ai * 7;
        vis.vinylColor = ai % 2 ? 0xffffff : 0x111111;
        const v = ctx.spawnAI(cdef, vis, parts);
        v.sim.reset(pos.x, pos.y + 1, pos.z, pos.heading);
        const rai = new RacerAI(v.sim, this.route, p);
        this.racers.push({ name: p.name, vehicle: v, ai: rai, isPlayer: false, idx: pos.i, lap: 0, progress: 0, finishTime: 0, cp: 0, color: colors[ai % colors.length] });
      }
    }

    // police for pursuits
    if (def.type === 'pursuit') {
      const pdef: CarDef = { ...getCar('halden_vektor'), body: POLICE_BODY };
      for (let k = 0; k < (def.police ?? 2); k++) {
        const pos = this.gridPos(-(k + 2) * 2);
        const vis = defaultVisual(pdef);
        vis.color = 0x111418;
        vis.vinyl = 3;
        vis.vinylColor = 0xf4f4f4;
        vis.vinylColor2 = 0x1d4ed8;
        const v = ctx.spawnAI(pdef, vis, { intake: 2, exhaust: 2, ecu: 2, turbo: 1, springs: 2, compound: 1 });
        v.sim.reset(pos.x, pos.y + 1, pos.z, pos.heading);
        this.police.push({ v, ai: new PoliceAI(v.sim) });
      }
      this.timer = def.duration ?? 90;
    }
    if (def.type === 'checkpoints') {
      this.timer = def.targets?.[0] ?? 30;
      const cps = this.route.checkpoints;
      for (let k = 0; k < cps.length; k++) {
        const segLen = this.route.d[cps[k]] - (k > 0 ? this.route.d[cps[k - 1]] : 0);
        this.cpBonus.push(segLen / 27 + 1);
      }
    }
    ctx.traffic.enabled = def.traffic;
    ctx.traffic.clear();
    ctx.skills.reset();
    ctx.skills.driftBoost = def.type === 'drift' ? 1.3 : 1;
    // checkpoint gate
    this.gate = new Group();
    const gm = new MeshBasicMaterial({ color: 0xe01a2b, transparent: true, opacity: 0.75, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const arch = new Mesh(new TorusGeometry(1, 0.035, 6, 40, Math.PI), gm);
    this.gate.add(arch);
    ctx.scene.add(this.gate);
    this.placeGate();
    for (const r of this.racers) r.idx = this.route.project(r.vehicle.sim.position.x, r.vehicle.sim.position.z, -1).i;
  }

  private pickRivalCar(playerPi: number, rng: Rng, diff: number): { def: CarDef; parts: PartLevels } {
    const maxCls = this.def.maxClass;
    const target = playerPi + (diff - 2) * 25;
    // candidates: cars whose upgraded PI can match the player
    const pool = CARS.filter((c) => {
      if (this.def.type === 'sprint' && this.def.legs.some((l) => l.road === 'forest')) return c.category === 'offroad' || c.category === 'suv' || c.category === 'jdm' || c.category === 'hatch';
      return c.category !== 'offroad';
    });
    let best: { def: CarDef; parts: PartLevels; d: number } | null = null;
    for (let tries = 0; tries < 8; tries++) {
      const def = rng.pick(pool);
      const lvl = Math.max(0, Math.min(3, Math.round((target - computeStatsCached(def, 0)) / 60)));
      const parts: PartLevels = {};
      if (lvl > 0) for (const p of PARTS) if (p.slot !== 'compound' && p.slot !== 'nitro' && p.slot !== 'turbo') parts[p.slot] = lvl;
      const pi = computeStatsCached(def, lvl);
      if (maxCls && CLASS_ORDER.indexOf(piToClass(pi)) > CLASS_ORDER.indexOf(maxCls)) continue;
      const d = Math.abs(pi - target);
      if (!best || d < best.d) best = { def, parts, d };
    }
    return best ?? { def: getCar('petra_hot'), parts: {} };
  }

  private gridPos(slot: number) {
    const r = this.route;
    const row = Math.floor(Math.abs(slot) / 2);
    const side = Math.abs(slot) % 2 === 0 ? -1 : 1;
    const back = slot < 0 ? -slot * 12 + this.startDist : this.startDist - 6 - row * 9;
    const i = r.indexAtDist(r.closed ? back : Math.max(0, back));
    const lat = side * Math.min(2.6, r.hw[i] * 0.45);
    return { i, x: r.x[i] - r.tz[i] * lat, y: r.y[i], z: r.z[i] + r.tx[i] * lat, heading: r.heading(i) };
  }

  private placeGate() {
    const r = this.route;
    const cps = r.checkpoints;
    const idx = this.player ? Math.min(this.player.cp, cps.length - 1) : 0;
    const i = cps[idx];
    const w = r.hw[i] + 1.2;
    this.gate.position.set(r.x[i], r.y[i], r.z[i]);
    this.gate.rotation.set(0, r.heading(i), 0);
    this.gate.scale.set(w, w * 0.6, w);
    this.gate.visible = this.def.type !== 'pursuit' && this.def.type !== 'topspeed';
  }

  get raceLength() {
    const r = this.route;
    return r.closed ? r.length * this.def.laps : r.length - this.startDist - 5;
  }

  private trackRacer(rc: Racer) {
    const r = this.route;
    const s = rc.vehicle.sim;
    const pr = r.project(s.position.x, s.position.z, rc.idx, 30);
    if (pr.err > 60) return; // off route: no progress
    if (r.closed) {
      if (pr.i < r.n * 0.25 && rc.idx > r.n * 0.75) rc.lap++;
      else if (pr.i > r.n * 0.75 && rc.idx < r.n * 0.25) rc.lap--;
    }
    rc.idx = pr.i;
    const d = r.d[pr.i];
    rc.progress = r.closed ? rc.lap * r.length + d - this.startDist : d - this.startDist;
    // checkpoints in order
    const cps = r.checkpoints;
    const lapCp = rc.cp % cps.length;
    const cpLap = Math.floor(rc.cp / cps.length);
    const target = r.closed ? cpLap * r.length + r.d[cps[lapCp]] - this.startDist : r.d[cps[lapCp]] - this.startDist;
    if (rc.progress >= target - 3 && rc.cp < cps.length * (r.closed ? this.def.laps : 1)) {
      rc.cp++;
      if (rc.isPlayer) {
        this.placeGate();
        if (this.def.type === 'checkpoints') {
          const bonus = this.cpBonus[lapCp] ?? 10;
          this.timer += bonus;
          this.ctx.toast(t('checkpoint'), `+${bonus.toFixed(1)}s`);
        }
        this.ctx.sfx('checkpoint');
      }
    }
  }

  update(dt: number) {
    const ctx = this.ctx;
    const ps = this.player.vehicle.sim;
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const c = Math.ceil(this.countdown);
      if (c !== this.lastShown && c >= 0) {
        this.lastShown = c;
        if (c > 0 && c <= 3) {
          ctx.bigMessage(String(c), 800);
          ctx.sfx('beep');
        } else if (c === 0) {
          ctx.bigMessage(t('go'), 900);
          ctx.sfx('go');
        }
      }
      for (const rc of this.racers) {
        const inp = rc.vehicle.sim.input;
        if (!rc.isPlayer) {
          inp.throttle = 0.35 + Math.sin(this.countdown * 6 + rc.name.length) * 0.2;
          inp.steer = 0;
        }
        inp.brake = 1;
        inp.handbrake = true;
      }
      for (const p of this.police) {
        p.v.sim.input.brake = 1;
        p.v.sim.input.throttle = 0;
      }
      if (this.countdown <= 0) {
        this.state = 'racing';
        for (const rc of this.racers) {
          rc.vehicle.sim.input.handbrake = false;
          rc.vehicle.sim.input.brake = 0;
        }
      }
      return;
    }
    if (this.state !== 'racing') {
      // after finishing: AI keeps cruising, player coasts
      for (const rc of this.racers) if (rc.ai) rc.ai.update(dt, [], this.player.progress);
      return;
    }
    this.time += dt;
    const others = this.racers.map((r) => ({ x: r.vehicle.sim.position.x, z: r.vehicle.sim.position.z, progress: r.progress, speed: r.vehicle.sim.forwardSpeed }));
    for (const rc of this.racers) {
      this.trackRacer(rc);
      if (rc.ai) {
        rc.ai.update(dt, others, this.player.progress);
        if (rc.ai.needsReset) rc.ai.resetToRoute();
      }
      if (!rc.finishTime && rc.progress >= this.raceLength) {
        rc.finishTime = this.time;
        if (rc.ai) rc.ai.finished = true;
      }
    }
    // wrong way
    const r = this.route;
    const pi = this.player.idx;
    const along = ps.velocity.x * r.tx[pi] + ps.velocity.z * r.tz[pi];
    this.wrongTimer = along < -4 ? this.wrongTimer + dt : 0;
    this.maxSpeed = Math.max(this.maxSpeed, ps.forwardSpeed * 3.6);

    switch (this.def.type) {
      case 'pursuit':
        this.updatePursuit(dt);
        return;
      case 'checkpoints':
        this.timer -= dt;
        if (this.timer <= 0) return this.finish(false, t('failed'));
        break;
      case 'topspeed':
        // radar = last 250 m
        if (this.player.progress > this.raceLength - 250) this.maxSpeedTrap = Math.max(this.maxSpeedTrap, ps.forwardSpeed * 3.6);
        break;
    }
    if (this.player.finishTime) this.finish(true);
  }

  private maxSpeedTrap = 0;

  private updatePursuit(dt: number) {
    const ps = this.player.vehicle.sim;
    this.timer -= dt;
    let nearest = Infinity;
    for (const p of this.police) {
      p.ai.update(dt, { x: ps.position.x, z: ps.position.z, vx: ps.velocity.x, vz: ps.velocity.z });
      const d = p.v.sim.position.distanceTo(ps.position);
      nearest = Math.min(nearest, d);
      // respawn police that fell far behind or got stuck off-road
      if (d > 320 || p.v.sim.isFlipped) {
        const sp = this.ctx.world.spawnOnRoad(ps.position.x - ps.velocity.x * 4 + (Math.random() - 0.5) * 60, ps.position.z - ps.velocity.z * 4 + (Math.random() - 0.5) * 60);
        p.v.sim.reset(sp.x, sp.y + 1, sp.z, sp.heading);
      }
    }
    if (nearest < 9 && ps.speed < 4) this.busted = Math.min(1, this.busted + dt / 2.5);
    else this.busted = Math.max(0, this.busted - dt * 0.6);
    if (this.busted >= 1) return this.finish(false, t('busted'));
    if (nearest > 260) this.escapeTimer += dt;
    else this.escapeTimer = 0;
    if (this.timer <= 0 || this.escapeTimer > 12) this.finish(true, t('escaped'));
  }

  /** Player asked to reset: back to the last checkpoint on the route. */
  resetPlayer() {
    const r = this.route;
    const cps = r.checkpoints;
    const lastCp = this.player.cp > 0 ? cps[(this.player.cp - 1) % cps.length] : r.indexAtDist(this.startDist - 2);
    const i = this.def.type === 'pursuit' ? r.project(this.player.vehicle.sim.position.x, this.player.vehicle.sim.position.z, -1).i : lastCp;
    if (this.def.type === 'pursuit') {
      const sp = this.ctx.world.spawnOnRoad(this.player.vehicle.sim.position.x, this.player.vehicle.sim.position.z);
      this.ctx.resetPlayer(sp.x, sp.y, sp.z, sp.heading);
    } else this.ctx.resetPlayer(r.x[i], r.y[i], r.z[i], r.heading(i));
    this.player.idx = i;
    this.time += this.def.type === 'timetrial' ? 3 : 0;
  }

  private finish(ok: boolean, reason?: string) {
    if (this.state === 'finished') return;
    this.state = 'finished';
    this.gate.visible = false;
    const def = this.def;
    let position = 1;
    let score = 0;
    const standings: Standing[] = [];
    if (def.rivals > 0) {
      // estimate unfinished rivals' times from their pace
      const est = (rc: Racer) => {
        if (rc.finishTime) return rc.finishTime;
        const pace = Math.max(5, rc.progress / Math.max(1, this.time));
        return this.time + (this.raceLength - rc.progress) / pace;
      };
      const order = [...this.racers].sort((a, b) => est(a) - est(b));
      for (const rc of order) standings.push({ name: rc.name, car: rc.vehicle.def.brand + ' ' + rc.vehicle.def.model, time: est(rc), isPlayer: rc.isPlayer, dnf: false });
      position = order.indexOf(this.player) + 1;
    } else if (def.type === 'timetrial' || def.type === 'checkpoints') {
      const tg = def.targets ?? [60, 70, 80];
      position = def.type === 'checkpoints' ? 1 : this.time <= tg[0] ? 1 : this.time <= tg[1] ? 2 : this.time <= tg[2] ? 3 : 4;
    } else if (def.type === 'topspeed') {
      score = Math.round(this.maxSpeedTrap);
      const tg = def.targets ?? [300, 250, 200];
      position = score >= tg[0] ? 1 : score >= tg[1] ? 2 : score >= tg[2] ? 3 : 4;
    } else if (def.type === 'drift') {
      score = Math.round(this.ctx.skills.driftTotal + this.ctx.skills.points * this.ctx.skills.mult);
      const tg = def.targets ?? [40000, 25000, 12000];
      position = score >= tg[0] ? 1 : score >= tg[1] ? 2 : score >= tg[2] ? 3 : 4;
    } else if (def.type === 'pursuit') {
      position = ok ? 1 : 4;
      score = Math.round(this.time);
    }
    const finished = ok;
    const rec = this.ctx.profile.recordEvent(def.id, { pos: position, time: this.time, score, finished });
    const share = finished ? [1, 0.6, 0.4, 0.22, 0.15, 0.12, 0.1, 0.08][position - 1] ?? 0.08 : 0.08;
    const firstBonus = rec.first ? 1.5 : 1;
    const cash = Math.round((def.reward.cash * share * firstBonus) / 50) * 50;
    const xp = Math.round(def.reward.xp * (finished ? Math.max(0.3, share) : 0.15) * firstBonus);
    this.ctx.profile.addCash(cash, 'event');
    this.ctx.profile.addXp(xp, 'event');
    this.result = { event: def, finished, position, time: this.time, score, standings, cash, xp, stars: rec.stars, first: rec.first, reason };
    this.ctx.sfx(finished && position <= 3 ? 'win' : 'lose');
    this.onFinish?.(this.result);
  }

  abandon() {
    this.state = 'finished';
  }

  hud(): RaceHud {
    const def = this.def;
    const sorted = [...this.racers].sort((a, b) => (b.finishTime ? 1e9 - b.finishTime : b.progress) - (a.finishTime ? 1e9 - a.finishTime : a.progress));
    const pos = sorted.indexOf(this.player) + 1;
    const r = this.route;
    const lap = clamp(this.player.lap + 1, 1, def.laps);
    let objective = L(def.name);
    let timer: number | null = null;
    let score: number | null = null;
    if (def.type === 'pursuit') {
      objective = t('evade');
      timer = Math.max(0, this.timer);
    } else if (def.type === 'checkpoints') timer = Math.max(0, this.timer);
    else if (def.type === 'drift') score = Math.round(this.ctx.skills.driftTotal);
    else if (def.type === 'topspeed') score = Math.round(this.player.progress > this.raceLength - 250 ? this.maxSpeedTrap : this.maxSpeed);
    const cpi = r.checkpoints[Math.min(this.player.cp, r.checkpoints.length - 1) % r.checkpoints.length];
    return {
      position: pos, total: this.racers.length, lap, laps: r.closed ? def.laps : 1, time: this.time, timer, score, objective,
      wrongWay: this.wrongTimer > 1, nextCp: new Vector3(r.x[cpi], r.y[cpi], r.z[cpi]),
      heat: this.police.length ? 1 : 0, busted: this.busted,
    };
  }

  dispose() {
    this.ctx.scene.remove(this.gate);
    for (const rc of this.racers) if (!rc.isPlayer) this.ctx.despawnAI(rc.vehicle);
    for (const p of this.police) this.ctx.despawnAI(p.v);
    this.ctx.traffic.enabled = true;
    this.ctx.skills.driftBoost = 1;
  }

  /** Positions of opponents for minimap. */
  get dots(): { x: number; z: number; color: string; police?: boolean }[] {
    const out: { x: number; z: number; color: string; police?: boolean }[] = this.racers.filter((r) => !r.isPlayer).map((r) => ({ x: r.vehicle.sim.position.x, z: r.vehicle.sim.position.z, color: r.color }));
    for (const p of this.police) out.push({ x: p.v.sim.position.x, z: p.v.sim.position.z, color: '#3b82f6', police: true });
    return out;
  }
}

const piCache = new Map<string, number>();
function computeStatsCached(def: CarDef, lvl: number): number {
  const k = def.id + lvl;
  if (piCache.has(k)) return piCache.get(k)!;
  const parts: PartLevels = {};
  if (lvl > 0) for (const p of PARTS) if (p.slot !== 'compound' && p.slot !== 'nitro' && p.slot !== 'turbo') parts[p.slot] = lvl;
  // lazy import of resolveSpec to avoid cycles
  const pi = quickPI(resolveSpecLazy(def, parts));
  piCache.set(k, pi);
  return pi;
}
import { resolveSpec as resolveSpecLazy } from '../vehicles/Tuning';
