// Partida: crea la escena, la atmósfera, el mapa, los combatientes y todos los sistemas,
// y ejecuta el bucle de juego completo hasta la victoria o la derrota.
import * as THREE from './lib/three.module.min.js';
import { buildTextures, setAniso } from './textures.js';
import { buildMap } from './map.js';
import { Effects } from './effects.js';
import { Combat } from './combat.js';
import { Projectiles } from './projectiles.js';
import { Streaks } from './streaks.js';
import { createMode } from './modes.js';
import { ViewModel } from './viewmodel.js';
import { HUD } from './hud.js';
import { Player } from './player.js';
import { Bot } from './bot.js';
import { Squad } from './squad.js';
import { Vehicle } from './vehicle.js';
import { Soldier } from './soldier.js';
import { Audio } from './audio.js';
import { Profile } from './profile.js';
import { QUALITY, DIFFICULTIES, WEAPONS, PRIMARIES, SECONDARIES, OPTICS, LETHALS, TACTICALS, PERKS, OPERATORS, SKINS, BOT_NAMES, TEAMS, MODES, xpForLevel, CAMOS } from './data.js';
import { clamp, damp, rand, choice, DEG, nextFrame } from './util.js';

const ATMOS = {
  noon: { sun: [0.35, 0.86, 0.3], sunColor: 0xfff1dc, sunInt: 3.3, sky: 0xbcd4f5, ground: 0x5f564b, hemi: 1.15, fog: 0xc8d4e0, dens: 0.006, exp: 0.95, top: 0x3f6fb8, hor: 0xd5e0ec, cloud: 0.35, cloudCol: 0xffffff },
  dusk: { sun: [-0.78, 0.2, -0.5], sunColor: 0xffa35c, sunInt: 3.1, sky: 0x8b9cc8, ground: 0x4d3b30, hemi: 0.85, fog: 0xc99876, dens: 0.0085, exp: 1.05, top: 0x26365f, hor: 0xf4a066, cloud: 0.5, cloudCol: 0xffc39a },
  storm: { sun: [0.25, 0.9, 0.3], sunColor: 0xc4ccd8, sunInt: 0.95, sky: 0x8a96a6, ground: 0x3c3e40, hemi: 1.05, fog: 0x6c7580, dens: 0.019, exp: 1.0, top: 0x39414c, hor: 0x77818d, cloud: 0.95, cloudCol: 0x9aa3ad },
  dawn: { sun: [0.82, 0.14, 0.55], sunColor: 0xffc49a, sunInt: 2.1, sky: 0xa2b5d8, ground: 0x47423e, hemi: 0.95, fog: 0xbcc6d6, dens: 0.013, exp: 1.0, top: 0x55699a, hor: 0xf1c6ac, cloud: 0.4, cloudCol: 0xffe2cc },
};

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 cloudCol; uniform float cloud; uniform float time; uniform float flash;
varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(hor, top, pow(clamp(y,0.0,1.0), 0.42));
  if (y < 0.0) col = mix(hor, hor*0.55, clamp(-y*4.0,0.0,1.0));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunCol * (pow(s, 1400.0)*40.0 + pow(s, 14.0)*0.45 + pow(s,3.0)*0.08);
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.12) * 0.55 + vec2(time*0.004, time*0.002);
    float c = fbm(uv*1.6);
    float m = smoothstep(0.62 - cloud*0.38, 0.95, c) * smoothstep(0.0, 0.18, y);
    vec3 cc = cloudCol * (0.75 + 0.35*fbm(uv*3.1 + 4.0)) + sunCol*pow(s,6.0)*0.4;
    col = mix(col, cc, m * (0.55 + cloud*0.4));
  }
  col += vec3(flash);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const RADIO = {
  contact: ['¡Contacto!', '¡Enemigo a la vista!', '¡Hostiles al frente!', '¡Los tengo!'],
  grenade: ['¡Granada!', '¡Cuidado, granada!'],
  nade: ['¡Lanzando granada!', '¡Explosivo fuera!'],
};

export class Game {
  constructor(app, cfg) {
    this.app = app; this.cfg = cfg;
    this.settings = Profile.s;
    this.Q = QUALITY[this.settings.quality] || QUALITY.medium;
    this.diff = DIFFICULTIES[cfg.difficulty] || DIFFICULTIES.normal;
    this.time = 0; this.realTime = 0; this.timeScale = 1;
    this.over = false; this.paused = false; this.started = false;
    this.combatants = []; this.vehicles = []; this.squads = []; this.pickups = [];
    this.tasks = [];
    this.firstBlood = false;
    this.shakeT = 0; this.drawDist2 = this.Q.drawDist * this.Q.drawDist;
    this.atmosVis = cfg.atmos === 'storm' ? 0.65 : cfg.atmos === 'dawn' ? 0.82 : 1;
    this.teamSize = cfg.mode === 'ffa' ? 1 : cfg.teamSize;
    this.renderScale = 1; this.pathBudget = 3;
    this.deathCam = null; this.spectate = null; this.calloutT = 0;
    this.godMode = false;
    this.ambient = [];
    this.thirdPerson = false;
  }

  // ------------------------------------------------------------ carga
  async load(progress) {
    const app = this.app, Q = this.Q, cfg = this.cfg;
    setAniso(Math.min(8, app.renderer.capabilities.getMaxAnisotropy()));
    const T = this.T = await buildTextures(Q.tex, (p) => progress(p * 0.45, 'Generando materiales'));
    progress(0.5, 'Levantando Puerto Varga'); await nextFrame();
    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, app.aspect, 0.06, Q.drawDist + 30);
    this.camera.rotation.order = 'YXZ';
    this.setupAtmosphere();
    progress(0.55, 'Levantando Puerto Varga'); await nextFrame();
    const map = this.map = buildMap(T, Q, cfg.atmos);
    scene.add(map.group);
    this.world = map.world; this.nav = map.nav;
    progress(0.75, 'Desplegando unidades'); await nextFrame();
    this.fx = new Effects(scene, T, Q, cfg.atmos);
    for (const f of map.fires) this.fx.addFire(f.x, f.y, f.z, f.s);
    this.combat = new Combat(this);
    this.projectiles = new Projectiles(this);
    this.streaks = new Streaks(this);
    map.onExplode = (pos, att) => this.combat.explode(pos, 5, 130, att, 'barrel', 0.9);
    map.onBreak = (type, pos) => { this.fx.debris(pos, type); Audio.play(type === 'glass' ? 'imp_glass' : 'imp_wood', { pos, vol: 0.9, ref: 4 }); };
    this.mode = createMode(this, cfg);
    this.vm = new ViewModel(T, cfg.look);
    this.vm.scene.environment = scene.environment; this.vm.scene.environmentIntensity = 0.9;
    this.input = app.input;
    this.createCombatants();
    if (cfg.mode === 'tdm' || cfg.mode === 'dom' || cfg.mode === 'ffa') for (const sp of map.vehicleSpawns) this.vehicles.push(new Vehicle(this, sp));
    this.createPickups();
    this.hud = new HUD(app.hudRoot, this);
    this.mode.init();
    if (cfg.mode !== 'sab') for (const c of this.combatants) this.respawn(c);
    progress(0.92, 'Calibrando sistemas'); await nextFrame();
    // precompilar shaders para evitar tirones
    this.updateCamera(0);
    try { app.renderer.compile(scene, this.camera); app.renderer.compile(this.vm.scene, this.vm.camera); this.render(); } catch (e) { /* opcional */ }
    this.onResize();
    progress(1, 'Listo');
    window.__game = this;
  }

  setupAtmosphere() {
    const A = this.A = ATMOS[this.cfg.atmos] || ATMOS.dusk;
    const scene = this.scene, Q = this.Q, r = this.app.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = A.exp;
    this.sunDir = new THREE.Vector3(...A.sun).normalize();
    const fogD = Math.max(A.dens, 1.9 / Q.drawDist);
    scene.fog = new THREE.FogExp2(A.fog, fogD);
    scene.background = new THREE.Color(A.fog);
    this.hemi = new THREE.HemisphereLight(A.sky, A.ground, A.hemi * 0.6);
    this.hemiBase = this.hemi.intensity;
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(A.sunColor, A.sunInt);
    sun.castShadow = Q.shadows;
    if (Q.shadows) {
      sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
      const s = Q.shadowSize >= 2048 ? 45 : 35;
      Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 220 });
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
      this.shadowSpan = s;
    }
    scene.add(sun, sun.target);
    // cielo
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color(A.top) }, hor: { value: new THREE.Color(A.hor) }, sunDir: { value: this.sunDir }, sunCol: { value: new THREE.Color(A.sunColor) }, cloudCol: { value: new THREE.Color(A.cloudCol) }, cloud: { value: A.cloud }, time: { value: 0 }, flash: { value: 0 } },
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this.skyMat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    scene.add(this.sky);
    // mapa de entorno para reflejos PBR
    {
      const pm = new THREE.PMREMGenerator(r);
      const es = new THREE.Scene();
      const sk = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat.clone());
      sk.material.uniforms.sunCol.value = new THREE.Color(A.sunColor).multiplyScalar(0.25);
      es.add(sk);
      const gnd = new THREE.Mesh(new THREE.CircleGeometry(90, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(A.ground).multiplyScalar(0.6) }));
      gnd.rotation.x = -Math.PI / 2; gnd.position.y = -2; es.add(gnd);
      this.envRT = pm.fromScene(es, 0.02);
      scene.environment = this.envRT.texture;
      scene.environmentIntensity = (this.cfg.atmos === 'storm' ? 0.55 : 0.7) * (Q.envMap ? 1 : 0.8);
      sk.geometry.dispose(); sk.material.dispose(); gnd.geometry.dispose(); gnd.material.dispose(); pm.dispose();
    }
  }

  createCombatants() {
    const cfg = this.cfg, P = Profile.data;
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    let ni = 0;
    const teams = MODES[cfg.mode].teams;
    const playerTeam = teams ? 0 : 100;
    const player = this.player = new Player(this, { name: P.name || 'OPERADOR', team: playerTeam, isPlayer: true, look: cfg.look, loadout: cfg.loadout });
    // modelo para tercera persona (vehículo)
    player.model = new Soldier(cfg.look, TEAMS[0].hex, cfg.loadout.primary, { camo: cfg.loadout.camo });
    player.model.root.visible = false; this.scene.add(player.model.root);
    this.combatants.push(player);
    const mk = (team) => {
      const bot = new Bot(this, { name: names[ni++ % names.length], team, look: this.randomLook(), loadout: this.randomLoadout() });
      this.combatants.push(bot);
      return bot;
    };
    if (teams) {
      for (let i = 0; i < cfg.teamSize - 1; i++) mk(0);
      for (let i = 0; i < cfg.teamSize; i++) mk(1);
      this.squads[0] = new Squad(this, 0); this.squads[1] = new Squad(this, 1);
      for (const c of this.combatants) if (c.brain) this.squads[c.team].add(c);
    } else {
      for (let i = 0; i < 7; i++) { const b = mk(101 + i); const s = new Squad(this, b.team); s.add(b); this.squads[b.team] = s; }
    }
  }
  randomLook() {
    const op = choice(OPERATORS);
    const skins = Object.keys(SKINS).filter((k) => !SKINS[k].challenge);
    return { operator: op.id, skin: choice(skins), headgear: 'default', facegear: 'default', backpack: Math.random() < 0.6 };
  }
  randomLoadout() {
    const d = this.diff.id;
    const pool = d === 'easy' ? ['vx9', 'mosca', 'mosca', 'bulldog', 'vx9'] : d === 'normal' ? ['vx9', 'mosca', 'kr4', 'bulldog', 'yunque', 'sable'] : ['vx9', 'kr4', 'kr4', 'mosca', 'yunque', 'centinela', 'sable', 'bulldog'];
    const primary = choice(pool);
    return {
      primary, secondary: choice(SECONDARIES), optic: choice(['iron', 'dot', 'holo', 'x3']), camo: choice(Object.keys(CAMOS).filter((k) => !CAMOS[k].challenge)),
      lethal: Math.random() < 0.75 ? 'frag' : 'impact', tactical: Math.random() < 0.5 ? 'smoke' : 'flash', perk: choice(Object.keys(PERKS)),
    };
  }
  createPickups() {
    const geo = new THREE.BoxGeometry(0.7, 0.4, 0.45);
    this.supplyMat = new THREE.MeshStandardMaterial({ color: 0x3f4a2c, roughness: 0.7, metalness: 0.3, emissive: 0x2a3a10, emissiveIntensity: 0.25 });
    this.cacheMat = new THREE.MeshStandardMaterial({ color: 0x8a6a1c, roughness: 0.5, metalness: 0.5, emissive: 0x6a4a00, emissiveIntensity: 0.4 });
    this.pickGeo = geo;
    for (const s of this.map.supplies) {
      const m = new THREE.Mesh(geo, s.kind === 'cache' ? this.cacheMat : this.supplyMat);
      const y = this.nav.floorAt(s.x, s.z);
      m.position.set(s.x, y + 0.2, s.z); m.castShadow = true; this.scene.add(m);
      this.pickups.push({ kind: s.kind, pos: m.position.clone(), mesh: m, readyAt: 0, cd: s.kind === 'cache' ? 60 : 25 });
    }
    this.dropGeo = new THREE.BoxGeometry(0.32, 0.18, 0.22);
  }
  dropAmmo(pos) {
    const drops = this.pickups.filter((p) => p.kind === 'drop');
    if (drops.length > 12) { const d = drops[0]; this.scene.remove(d.mesh); this.pickups.splice(this.pickups.indexOf(d), 1); }
    const m = new THREE.Mesh(this.dropGeo, this.supplyMat);
    m.position.set(pos.x, pos.y + 0.1, pos.z); this.scene.add(m);
    this.pickups.push({ kind: 'drop', pos: m.position.clone(), mesh: m, expires: this.time + 25, readyAt: 0 });
  }
  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.kind === 'drop' && this.time > p.expires) { this.scene.remove(p.mesh); this.pickups.splice(i, 1); continue; }
      const ready = this.time >= p.readyAt;
      p.mesh.visible = ready || p.kind !== 'drop';
      if (p.kind !== 'drop') p.mesh.material = ready ? (p.kind === 'cache' ? this.cacheMat : this.supplyMat) : this.supplyMat;
      p.mesh.rotation.y += dt * (ready ? 0.8 : 0);
      if (!ready) { p.mesh.scale.setScalar(0.6); continue; } else p.mesh.scale.setScalar(1);
      for (const c of this.combatants) {
        if (!c.alive || c.inVehicle) continue;
        if (Math.abs(c.pos.x - p.pos.x) > 1.3 || Math.abs(c.pos.z - p.pos.z) > 1.3 || Math.abs(c.pos.y - p.pos.y) > 1.6) continue;
        const needs = c.weapons.some((w) => w.reserve < w.def.reserve) || c.lethals < c.lethalDef.count || (p.kind === 'cache' && c.armor < 50);
        if (!needs) continue;
        const frac = p.kind === 'drop' ? 0.25 : p.kind === 'cache' ? 1 : 0.5;
        for (const w of c.weapons) w.refill(frac);
        if (p.kind !== 'drop') c.lethals = Math.max(c.lethals, c.lethalDef.count);
        if (p.kind === 'cache') { c.armor = 50; c.tacticals = c.tacticalDef.count; }
        if (c.isPlayer) { this.hud.popup('', p.kind === 'cache' ? 'ALIJO SECRETO: MUNICIÓN Y BLINDAJE' : 'MUNICIÓN RECOGIDA'); Audio.play('mag_in', { vol: 0.7 }); if (p.kind === 'cache') Audio.ui2d('ui_levelup', 0.5); }
        if (p.kind === 'drop') { this.scene.remove(p.mesh); this.pickups.splice(i, 1); }
        else p.readyAt = this.time + p.cd;
        break;
      }
    }
  }

  // ------------------------------------------------------------ utilidades usadas por los sistemas
  isEnemy(a, b) { return a.team !== b.team; }
  schedule(delay, fn) { this.tasks.push({ at: this.time + delay, fn }); }
  shake(k) { this.shakeT = Math.min(1.2, this.shakeT + k); }
  audioUI(name, vol) { Audio.ui2d(name, vol); }
  audioMuffle(k) { Audio.setMuffle(k * 0.9); }
  respawnDelay() { return this.mode.respawnDelay(); }
  noise(pos, radius, source, kind) {
    if (!source) return;
    for (const c of this.combatants) {
      if (!c.brain || !c.alive || c === source || !this.isEnemy(c, source)) continue;
      const r = radius * c.brain.D.hearing;
      if (Math.abs(c.pos.x - pos.x) > r || Math.abs(c.pos.z - pos.z) > r) continue;
      if (c.pos.distanceTo(pos) < r) c.brain.hear(pos, source, kind);
    }
  }
  bulletNear(shooter, o, d, maxT) {
    for (const c of this.combatants) {
      if (!c.brain || !c.alive || !this.isEnemy(c, shooter)) continue;
      if (c._supT && this.time - c._supT < 0.6) continue;
      const cx = c.pos.x - o.x, cy = c.pos.y + 1.2 - o.y, cz = c.pos.z - o.z;
      const s = cx * d.x + cy * d.y + cz * d.z;
      if (s < 0 || s > maxT + 1) continue;
      const qx = cx - d.x * s, qy = cy - d.y * s, qz = cz - d.z * s;
      if (qx * qx + qy * qy + qz * qz < 6.25) { c._supT = this.time; c.brain.suppressed(shooter); }
    }
  }
  botCallout(bot, kind) {
    if (!this.mode.def.teams || bot.team !== this.player.team) return;
    if (this.time - this.calloutT < 3) return;
    if (bot.pos.distanceTo(this.player.pos) > 70) return;
    this.calloutT = this.time;
    this.hud.radio(bot.name, choice(RADIO[kind] || RADIO.contact));
  }
  interactionFor(p) {
    const m = this.mode.interactionFor(p);
    if (m) return m;
    if (p.inVehicle) { const v = p.inVehicle; return { key: 'exit', label: 'BAJAR DEL VEHÍCULO', instant: true, action: () => v.eject(p) }; }
    for (const v of this.vehicles) if (v.canEnter && v.canEnter(p)) return { key: 'veh' + v.kind, label: 'SUBIR AL ' + v.name, instant: true, action: () => v.enter(p) };
    return null;
  }
  onPlayerDamaged(att, amount, info) {
    this.hud.damage(att && att !== this.player ? att : null);
    this.shake(Math.min(0.5, amount / 60));
    if (this.settings.haptics && navigator.vibrate) { try { navigator.vibrate(20); } catch (e) { /* */ } }
    if (amount > 2) Audio.play('imp_body', { vol: 0.6 });
  }
  onPlayerFlashed(k, dur) { this.hud.flash(k, dur); Audio.play('tinnitus', { vol: k * 0.5 }); }

  onDeath(victim, killer, info) {
    victim.deathTime = this.time;
    if (victim.brain && victim.brain.cover) { victim.brain.cover.owner = null; victim.brain.cover = null; }
    if (killer && killer !== victim) {
      const w = info.weapon; if (killer.isPlayer && w) killer.weaponKills = killer.weaponKills || {}, killer.weaponKills[w] = (killer.weaponKills[w] || 0) + 1;
    }
    if (this.mode.def.respawn || victim.isPlayer) this.dropAmmo(victim.pos);
    if (victim.isPlayer) {
      const wName = info.weapon && WEAPONS[info.weapon] ? WEAPONS[info.weapon].name : (info.explosive ? 'EXPLOSIVO' : '');
      this.hud.showDeath(killer && killer !== victim ? killer : null, wName);
      this.deathCam = { t: 0, killer: killer && killer !== victim ? killer : null, from: this.camera.position.clone(), yaw: this.player.yaw };
      this.streaks.cancelDesignation(); this.projectiles.hidePreview();
      this.player.nadeHold = null;
      this.input.adsToggle = false;
      this.vm.visible = false;
    }
  }
  respawn(c) {
    if (c.inVehicle) c.inVehicle.eject(c);
    const p = this.mode.spawnPoint(c);
    c.resetForSpawn(p);
    if (c.isPlayer) {
      this.deathCam = null; this.spectate = null; this.hud.hideDeath(); this.vm.visible = true;
      c.equipViewModel(); this.hud.buildSlots();
      if (c.model) c.model.root.visible = false;
    }
  }

  // ------------------------------------------------------------ bucle
  start() {
    this.started = true;
    this.input.enabled = true; this.input.clearAll();
    this.input.onUnlock = () => { if (!this.paused && !this.over && this.started && !this.input.touchMode) this.pause(); };
    const m = this.mode.def;
    const showMode = () => { if (this.cfg.mode !== 'sab' && !this.over) this.hud.notice(m.name, 'ally', m.desc); };
    const tutorial = !Profile.data.tutorialSeen;
    if (!tutorial) showMode();
    Audio.ui2d('sting_start', 0.55);
    this.ambient.push(Audio.play('loop_wind', { loop: true, vol: 0.25, bus: 'amb' }));
    if (this.cfg.atmos === 'storm') this.ambient.push(Audio.play('loop_rain', { loop: true, vol: 0.55, bus: 'amb' }));
    for (const f of this.map.fires.slice(0, 4)) this.ambient.push(Audio.play('loop_fire', { pos: new THREE.Vector3(f.x, f.y, f.z), loop: true, vol: 0.6, ref: 3, maxDist: 400 }));
    this.nextLightning = 6 + Math.random() * 8; this.nextFlyby = 40 + Math.random() * 30; this.nextDistant = 8;
    this.app.lockPointer();
    if (tutorial) { Profile.data.tutorialSeen = true; Profile.save(); this.hud.showTutorial(this.input.touchMode, showMode); }
  }
  pause() {
    if (this.over || this.paused) return;
    this.paused = true; this.input.enabled = false; this.input.clearAll();
    if (document.pointerLockElement) document.exitPointerLock();
    this.app.showPause();
  }
  resume() {
    this.paused = false; this.input.enabled = true; this.input.clearAll();
    this.app.lockPointer();
  }

  frame(dtReal) {
    if (!this.started) return;
    if (this.paused) { this.render(); return; }
    let dt = Math.min(dtReal, 0.05) * this.timeScale;
    const steps = this.timeScale > 1 ? Math.ceil(this.timeScale) : 1;
    dt /= steps;
    for (let i = 0; i < steps; i++) this.update(dt);
    this.render();
  }

  update(dt) {
    const inp = this.input;
    this.time += dt;
    this.pathBudget = 3;
    if (inp.wasPressed('pause')) { this.pause(); return; }
    const P = this.player;
    // jugador
    if (P.alive && !this.over) {
      if (P._sabFrozen) { const l = inp.consumeLook(); P.yaw -= l.dx * 0.004 * this.settings.sensX; P.pitch = clamp(P.pitch - l.dy * 0.004 * this.settings.sensY, -1.4, 1.4); this.vm.update(dt, { ads: false, sprint: false, moveSpeed: 0, lookDX: 0, lookDY: 0, grounded: true, crouch: false, time: this.time }); }
      else P.update(dt);
      // interacción también dentro del vehículo
      if (P.inVehicle) P.updateInteract(dt);
    }
    for (const v of this.vehicles) if (v.update) v.update(dt);
    if (!this.over) {
      for (const c of this.combatants) {
        if (!c.alive || c.inVehicle) continue;
        for (const v of this.vehicles) if (v.pushOut && v.alive !== undefined) v.pushOut(c.pos, c.radius);
      }
      for (const c of this.combatants) if (c.brain && !c._sabFrozen) c.update(dt); else if (c.brain) { c.model.root.position.copy(c.pos); c.model.update(dt, { speed: 0, crouch: false, aimPitch: 0, grounded: true }); }
      for (const s of this.squads) if (s) s.update(dt);
      this.projectiles.update(dt);
      this.streaks.update(dt);
      this.mode.update(dt);
      this.updatePickups(dt);
      // reapariciones
      if (this.mode.canRespawn()) for (const c of this.combatants) if (!c.alive && this.time >= c.respawnAt) this.respawn(c);
    } else {
      for (const c of this.combatants) if (c.brain) c.update(0);
    }
    // tareas programadas
    for (let i = this.tasks.length - 1; i >= 0; i--) { const t = this.tasks[i]; if (this.time >= t.at) { this.tasks.splice(i, 1); try { t.fn(); } catch (e) { console.error(e); } } }
    this.fx.update(dt, this.camera, this.time);
    this.updateCamera(dt);
    this.updatePlayerModel(dt);
    this.updateEnvironment(dt);
    this.hud.update(dt);
    if (!P.alive) {
      const left = P.respawnAt - this.time;
      this.hud.setDeathTimer(this.mode.canRespawn() ? (left > 0 ? `REAPARECES EN ${Math.ceil(left)}` : '') : (this.spectate ? `OBSERVANDO A ${this.spectate.name.toUpperCase()}` : 'ESPERANDO A LA SIGUIENTE RONDA'));
    }
    if (this.mode.result && !this.over) this.endMatch();
    inp.endFrame();
  }

  updateCamera(dt) {
    const cam = this.camera, P = this.player, S = this.settings;
    let fov = S.fov;
    if (P.alive && !P.inVehicle) {
      cam.position.set(P.pos.x, P.pos.y + P.eyeSmooth, P.pos.z);
      if (P.landT > 0) { P.landT -= dt; cam.position.y -= Math.sin(P.landT / 0.25 * Math.PI) * 0.06; }
      cam.rotation.set(P.pitch, P.yaw, 0);
      const z = P.currentZoom();
      fov = S.fov / (1 + (z - 1) * P.adsT);
      if (P.sprint) fov += 5;
      this.deathCam = null;
    } else if (P.alive && P.inVehicle && P.inVehicle.turret) {
      // blindado: cámara de artillero (la mira central dispara la torreta)
      const v = P.inVehicle;
      const yaw = P.yaw, pitch = clamp(P.pitch, -0.35, 0.5);
      P.pitch = pitch;
      const tx = v.pos.x, ty = v.pos.y + 3.1, tz = v.pos.z;
      let cx = tx + Math.sin(yaw) * 6.5, cy = ty + 0.8, cz = tz + Math.cos(yaw) * 6.5;
      const dx = cx - tx, dy = cy - ty, dz = cz - tz, L = Math.hypot(dx, dy, dz);
      const r = this.world.raycast(tx, ty, tz, dx / L, dy / L, dz / L, L, 'solid', {});
      if (r) { const k = Math.max(1.2, r.t - 0.3) / L; cx = tx + dx * k; cy = ty + dy * k; cz = tz + dz * k; }
      cam.position.set(cx, cy, cz);
      cam.rotation.set(pitch - 0.08, yaw, 0);
      fov = S.fov;
    } else if (P.alive && P.inVehicle) {
      const v = P.inVehicle;
      const yaw = P.yaw, pitch = clamp(P.pitch, -0.6, 0.35);
      const dist = 7.5;
      const tx = v.pos.x, ty = v.pos.y + 1.8, tz = v.pos.z;
      let cx = tx + Math.sin(yaw) * Math.cos(pitch) * dist, cy = ty + 1.2 - Math.sin(pitch) * dist, cz = tz + Math.cos(yaw) * Math.cos(pitch) * dist;
      const dx = cx - tx, dy = cy - ty, dz = cz - tz, L = Math.hypot(dx, dy, dz);
      const r = this.world.raycast(tx, ty, tz, dx / L, dy / L, dz / L, L, 'solid', {});
      if (r) { const k = Math.max(1.5, r.t - 0.3) / L; cx = tx + dx * k; cy = ty + dy * k; cz = tz + dz * k; }
      cam.position.set(cx, Math.max(0.5, cy), cz);
      cam.lookAt(tx, ty + 0.5, tz);
      fov = S.fov + Math.abs(v.speed) * 0.4;
    } else if (this.deathCam) {
      const dc = this.deathCam; dc.t += dt;
      const k = Math.min(1, dc.t / 1.2);
      cam.position.set(dc.from.x, dc.from.y + k * 2.2, dc.from.z);
      if (dc.killer && dc.killer.alive) { const h = dc.killer.head(new THREE.Vector3()); const m = new THREE.Matrix4().lookAt(cam.position, h, cam.up); const q = new THREE.Quaternion().setFromRotationMatrix(m); cam.quaternion.slerp(q, Math.min(1, dt * 4)); }
      else cam.rotation.set(-0.6 * k, dc.yaw, 0);
      if (!this.mode.canRespawn() && dc.t > 3) { this.deathCam = null; this.spectate = this.pickSpectate(); }
    } else if (!this.mode.canRespawn()) {
      if (!this.spectate || !this.spectate.alive) this.spectate = this.pickSpectate();
      const s = this.spectate;
      if (s) {
        if (this.input.wasPressed('fire') || this.input.wasPressed('switch')) { this.spectate = this.pickSpectate(s); }
        const yaw = s.yaw;
        const tx = s.pos.x, ty = s.pos.y + 1.7, tz = s.pos.z;
        let cx = tx + Math.sin(yaw) * 3.2, cz = tz + Math.cos(yaw) * 3.2, cy = ty + 0.6;
        const dx = cx - tx, dy = cy - ty, dz = cz - tz, L = Math.hypot(dx, dy, dz);
        const r = this.world.raycast(tx, ty, tz, dx / L, dy / L, dz / L, L, 'solid', {});
        if (r) { const k = Math.max(0.6, r.t - 0.2) / L; cx = tx + dx * k; cy = ty + dy * k; cz = tz + dz * k; }
        cam.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 8));
        cam.lookAt(tx - Math.sin(yaw) * 10, ty - 0.3 + Math.sin(s.pitch) * 10, tz - Math.cos(yaw) * 10);
      }
    }
    // temblor
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt * 1.8);
      const k = this.shakeT * this.shakeT * 0.05, t = this.time * 40;
      cam.rotation.x += Math.sin(t * 1.1) * k; cam.rotation.y += Math.sin(t * 0.9 + 1) * k; cam.rotation.z = Math.sin(t * 1.3 + 2) * k * 0.6;
    } else if (P.alive && !P.inVehicle) cam.rotation.z = 0;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = damp(cam.fov, fov, 18, dt || 1); cam.updateProjectionMatrix(); this.fx.setScale(this.app.pixelHeight / (2 * Math.tan(cam.fov * DEG / 2))); }
    // oyente de audio
    cam.getWorldDirection(_fwd);
    Audio.setListener(cam.position, _fwd, _up.set(0, 1, 0));
    // sombra que sigue a la cámara (ajustada a la rejilla de texels)
    if (this.Q.shadows) {
      const s = this.shadowSpan, texel = (2 * s) / this.Q.shadowSize;
      const fx = Math.round((cam.position.x + _fwd.x * s * 0.5) / texel) * texel, fz = Math.round((cam.position.z + _fwd.z * s * 0.5) / texel) * texel;
      this.sun.target.position.set(fx, 0, fz);
      this.sun.position.set(fx + this.sunDir.x * 100, this.sunDir.y * 100, fz + this.sunDir.z * 100);
    } else { this.sun.position.copy(this.sunDir).multiplyScalar(100); }
    this.sky.position.copy(cam.position);
  }
  pickSpectate(after) {
    const al = this.combatants.filter((c) => c.alive && c.team === this.player.team && c !== this.player);
    if (!al.length) return null;
    if (!after) return al[0];
    const i = al.indexOf(after);
    return al[(i + 1) % al.length];
  }
  updatePlayerModel(dt) {
    const P = this.player, m = P.model;
    if (!m) return;
    if (P.alive && P.inVehicle) {
      const v = P.inVehicle;
      m.root.visible = true;
      m.root.position.set(v.pos.x, v.pos.y + 0.15, v.pos.z);
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
      m.root.position.x += -0.45 * c + 0.2 * s; m.root.position.z += 0.45 * s + 0.2 * c;
      m.root.rotation.y = v.yaw;
      m.update(dt, { speed: 0, crouch: false, aimPitch: 0, grounded: true });
      for (const L of m.legs) { L.thigh.rotation.x = 1.45; L.shin.rotation.x = -1.4; }
      m.hips.position.y = 0.75;
    } else m.root.visible = false;
  }
  updateEnvironment(dt) {
    this.skyMat.uniforms.time.value = this.time;
    // relámpagos
    if (this.cfg.atmos === 'storm') {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.nextLightning = rand(8, 20);
        this.lightningT = 0.35;
        this.schedule(rand(0.8, 2.5), () => Audio.play('thunder', { vol: 0.9, bus: 'amb' }));
      }
      if (this.lightningT > 0) {
        this.lightningT -= dt;
        const f = (this.lightningT > 0.25 || (this.lightningT < 0.15 && this.lightningT > 0.08)) ? 1 : 0;
        this.hemi.intensity = this.hemiBase + f * 3; this.skyMat.uniforms.flash.value = f * 0.6;
      } else { this.hemi.intensity = this.hemiBase; this.skyMat.uniforms.flash.value = 0; }
    }
    // eventos ambientales: reactores de paso y combates lejanos
    this.nextFlyby -= dt;
    if (this.nextFlyby <= 0) { this.nextFlyby = rand(55, 95); this.flyby(); }
    if (this.jet) {
      this.jet.t += dt;
      this.jet.mesh.position.addScaledVector(this.jet.v, dt);
      if (this.jet.snd) this.jet.snd.setPos(this.jet.mesh.position);
      if (this.jet.t > 6) { this.scene.remove(this.jet.mesh); this.jet = null; }
    }
    this.nextDistant -= dt;
    if (this.nextDistant <= 0) {
      this.nextDistant = rand(9, 22);
      const a = Math.random() * 6.28; const p = new THREE.Vector3(Math.cos(a) * 170, 5, Math.sin(a) * 170);
      if (Math.random() < 0.5) Audio.play('explosion', { pos: p, vol: 0.5, ref: 30, maxDist: 500, bus: 'amb' });
      else for (let i = 0; i < 6; i++) this.schedule(i * 0.11, () => Audio.play('gun_lmg', { pos: p, vol: 0.4, ref: 25, maxDist: 500, bus: 'amb' }));
    }
  }
  flyby() {
    if (this.jet) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x55606a, metalness: 0.6, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.9, 9, 8), mat); body.rotation.x = -Math.PI / 2; g.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 3), mat); wing.position.z = 1; g.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2, 2), mat); tail.position.set(0, 1, 3.5); g.add(tail);
    const a = Math.random() * 6.28;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    g.position.set(-dir.x * 260, 95, -dir.z * 260);
    g.lookAt(g.position.clone().add(dir)); g.rotateY(Math.PI);
    this.scene.add(g);
    this.jet = { mesh: g, v: dir.multiplyScalar(95), t: 0, snd: Audio.play('flyby', { pos: g.position, vol: 1, ref: 60, maxDist: 600, bus: 'amb' }) };
  }

  render() {
    if (this.noRender) return;
    const r = this.app.renderer;
    r.autoClear = false;
    r.clear();
    r.render(this.scene, this.camera);
    const P = this.player;
    if (P.alive && !P.inVehicle && this.vm.root.visible) {
      this.vm.syncLights(this.camera, this.sunDir, this.sun.color, this.sun.intensity, this.hemi.color, this.hemi.groundColor, this.hemi.intensity * 0.9 + 0.25);
      r.clearDepth();
      r.render(this.vm.scene, this.vm.camera);
    }
  }
  onResize() {
    const a = this.app.aspect;
    this.camera.aspect = a; this.camera.updateProjectionMatrix();
    this.vm.setAspect(a, a < 1.3 ? 70 : 58);
    this.fx.setScale(this.app.pixelHeight / (2 * Math.tan(this.camera.fov * DEG / 2)));
  }

  // ------------------------------------------------------------ fin de partida
  endMatch() {
    this.over = true;
    const res = this.mode.result, P = this.player;
    let outcome = 'draw';
    if (!res.draw) outcome = res.winner === P.team ? 'win' : 'loss';
    this.outcome = outcome;
    this.input.enabled = false; this.input.clearAll();
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.notice(outcome === 'win' ? 'VICTORIA' : outcome === 'loss' ? 'DERROTA' : 'EMPATE', outcome === 'win' ? 'ally big' : outcome === 'loss' ? 'enemy big' : 'ally big', res.reason);
    Audio.ui2d(outcome === 'win' ? 'sting_win' : 'sting_lose', 0.8);
    this.summary = this.buildSummary(outcome, res);
    setTimeout(() => this.app.showResults(this.summary), 3500);
  }
  buildSummary(outcome, res) {
    const P = this.player, S = P.stats, prof = Profile.data, st = prof.stats;
    const lvlBefore = prof.level, xpBefore = prof.xp;
    // estadísticas de carrera
    st.matches++; if (outcome === 'win') st.wins++; else if (outcome === 'loss') st.losses++; else st.draws++;
    st.kills += S.kills; st.deaths += S.deaths; st.assists += S.assists; st.headshots += S.headshots;
    st.shots += S.shots; st.hits += S.hits; st.score += S.score; st.bestStreak = Math.max(st.bestStreak, S.bestStreak);
    st.explosiveKills += S.explosiveKills; st.captures += S.captures; st.objectives += S.plants + S.defuses;
    st.playTime += this.time; st.bestScore = Math.max(st.bestScore, S.score);
    if (outcome === 'win' && this.diff.id === 'elite') st.eliteWins++;
    for (const [w, k] of Object.entries(P.weaponKills || {})) st.weaponKills[w] = (st.weaponKills[w] || 0) + k;
    // experiencia
    const diffMul = { easy: 0.8, normal: 1, hard: 1.25, elite: 1.5 }[this.diff.id];
    const xp = {
      score: Math.round(S.score * diffMul),
      result: outcome === 'win' ? 600 : outcome === 'draw' ? 300 : 150,
      time: Math.round(this.time / 60 * 40),
    };
    const total = xp.score + xp.result + xp.time;
    Profile.addXp(total);
    const done = Profile.checkChallenges();
    const unlocks = [];
    for (let L = lvlBefore + 1; L <= prof.level; L++) {
      for (const k of PRIMARIES.concat(SECONDARIES)) if (WEAPONS[k].unlock === L) unlocks.push('Arma: ' + WEAPONS[k].name);
      for (const k in OPTICS) if (OPTICS[k].unlock === L) unlocks.push('Óptica: ' + OPTICS[k].name);
      for (const k in CAMOS) if (CAMOS[k].unlock === L) unlocks.push('Camuflaje: ' + CAMOS[k].name);
      for (const k in SKINS) if (SKINS[k].unlock === L) unlocks.push('Aspecto: ' + SKINS[k].name);
      for (const k in PERKS) if (PERKS[k].unlock === L) unlocks.push('Ventaja: ' + PERKS[k].name);
      for (const k in LETHALS) if (LETHALS[k].unlock === L) unlocks.push('Letal: ' + LETHALS[k].name);
      for (const k in TACTICALS) if (TACTICALS[k].unlock === L) unlocks.push('Táctica: ' + TACTICALS[k].name);
    }
    for (const c of done) if (c.reward) unlocks.push('Recompensa de reto: ' + c.name);
    Profile.save();
    const teams = this.mode.def.teams;
    const players = this.combatants.map((c) => ({ name: c.name, team: c.team, me: c.isPlayer, ...c.stats })).sort((a, b) => b.score - a.score);
    return {
      outcome, reason: res.reason, mode: this.mode.def, cfg: this.cfg, diff: this.diff,
      teamScores: teams ? [this.mode.teamScore(P.team), this.mode.teamScore(1 - P.team)] : null,
      ffaPlace: teams ? null : this.combatants.slice().sort((a, b) => b.stats.kills - a.stats.kills).indexOf(P) + 1,
      players, me: { ...S, accuracy: S.shots ? Math.round((S.hits / S.shots) * 100) : 0, time: this.time },
      xp, xpTotal: total, lvlBefore, xpBefore, lvlAfter: prof.level, xpAfter: prof.xp, xpNeed: xpForLevel(prof.level),
      challenges: done, unlocks,
    };
  }

  dispose() {
    const app = this.app;
    for (const a of this.ambient) if (a) a.stop();
    this.streaks.dispose(); this.projectiles.dispose();
    for (const v of this.vehicles) if (v.dispose) v.dispose();
    this.mode.dispose();
    this.fx.dispose();
    this.hud.destroy();
    this.map.dispose();
    this.scene.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry._shared) { /* geometrías propias del mapa ya liberadas */ } });
    if (this.envRT) this.envRT.dispose();
    this.sky.geometry.dispose(); this.skyMat.dispose();
    this.scene.clear();
    this.input.enabled = false; this.input.clearAll(); this.input.onUnlock = null;
    if (window.__game === this) window.__game = null;
    app.renderer.renderLists.dispose();
  }
}
const _fwd = new THREE.Vector3(), _up = new THREE.Vector3();
