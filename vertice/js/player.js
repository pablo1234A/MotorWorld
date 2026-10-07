// Jugador: movimiento con aceleración, sprint con resistencia, deslizamiento, agacharse,
// salto, disparo con retroceso recuperable, apuntado, recarga, cambio, granadas con
// trayectoria, interacción contextual y asistencia de apuntado configurable.
import * as THREE from 'three';
import { Combatant } from './actors.js';
import { Audio } from './audio.js';
import { clamp, damp, DEG, wrapAngle } from './util.js';
import { OPTICS } from './data.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _o = new THREE.Vector3(), _t = new THREE.Vector3(), _mres = {};

export class Player extends Combatant {
  constructor(game, o) {
    super(game, o);
    this.vy = 0; this.stamina = 1; this.sprintLatch = false; this.slideT = 0; this.slideDir = new THREE.Vector3();
    this.recoilAcc = 0; this.eyeSmooth = 1.62; this.stepAcc = 0; this.sprintOut = 0; this.adsT = 0; this.wasAds = false;
    this.switching = false; this.nadeHold = null; this.interactT = 0; this.interactKey = null;
    this.exhausted = false; this.aimTarget = null; this.aimCheckT = 0; this.landT = 0;
    this.moveSpeed = 0; this.lastLook = { dx: 0, dy: 0 };
  }
  get vm() { return this.game.vm; }
  equipViewModel() {
    const w = this.weapon;
    this.vm.setWeapon(w.def, w.optic, w.camo);
  }
  resetForSpawn(p) {
    super.resetForSpawn(p);
    this.vy = 0; this.stamina = 1; this.sprintLatch = false; this.slideT = 0; this.recoilAcc = 0; this.adsT = 0;
    this.switching = false; this.nadeHold = null; this.interactT = 0; this.eyeSmooth = 1.62;
    if (this.vm) { this.equipViewModel(); this.vm.reloadT = -1; this.vm.switchT = -1; }
  }

  update(dt) {
    const g = this.game, inp = g.input, S = g.settings;
    if (!this.alive) return;
    const t = g.time;
    // ------------------ vista
    const look = inp.consumeLook(); this.lastLook = look;
    const ws = this.weapon, def = ws.def;
    const zoom = this.currentZoom();
    const base = look.src === 'mouse' ? 0.0022 : 0.0046;
    let sx = base * S.sensX, sy = base * S.sensY * (S.invertY ? -1 : 1);
    if (this.adsT > 0.5) { const k = S.sensAds / Math.pow(zoom, 0.65); sx *= k; sy *= k; }
    if (this.aimTarget && S.aimAssist > 0) { const slow = 1 - 0.45 * S.aimAssist; sx *= slow; sy *= slow; }
    this.yaw = wrapAngle(this.yaw - look.dx * sx);
    this.pitch = clamp(this.pitch - look.dy * sy, -1.45, 1.45);
    if (this.inVehicle) return;
    // ------------------ movimiento
    const mx = inp.move.x, my = inp.move.y;
    const moving = Math.abs(mx) + Math.abs(my) > 0.08;
    const ads = inp.ads && !this.switching && !this.nadeHold && this.slideT <= 0;
    // sprint
    const forwardPush = my < -0.55;
    const autoSprint = S.autoSprint && inp.touchMode && inp.joyMag > 1.15 && forwardPush;
    if (inp.wasPressed('sprint')) this.sprintLatch = !this.sprintLatch;
    if (!moving) this.sprintLatch = false;
    const wantSprint = (this.sprintLatch || inp.isHeld('sprint') && !inp.touchMode || autoSprint) && forwardPush && this.grounded && !ads;
    if (this.stamina <= 0) this.exhausted = true;
    if (this.exhausted && this.stamina > 0.25) this.exhausted = false;
    const canSprint = wantSprint && !this.exhausted && !this.crouch;
    if (canSprint && inp.isHeld('fire')) { this.sprintLatch = false; this.sprintOut = t + 0.12; }
    this.sprint = canSprint && !inp.isHeld('fire') && !this.nadeHold;
    const stamMax = this.perk === 'atleta' ? 12 : 6;
    if (this.sprint) this.stamina = Math.max(0, this.stamina - dt / stamMax);
    else this.stamina = Math.min(1, this.stamina + dt / 4);
    // agacharse / deslizar
    if (inp.wasPressed('crouch')) {
      if (this.sprint && this.moveSpeed > 5.5 && this.grounded) {
        this.slideT = 0.75; this.crouch = true; this.sprint = false; this.sprintLatch = false;
        this.slideDir.set(this.vel.x, 0, this.vel.z).normalize();
        this.vel.x *= 1.35; this.vel.z *= 1.35;
        Audio.play('land', { vol: 0.5, rate: 0.7 });
      } else if (this.crouch) { if (this.canStand()) this.crouch = false; }
      else this.crouch = true;
    }
    if (this.sprint && this.crouch && this.slideT <= 0 && this.canStand()) this.crouch = false;
    this.height = this.crouch ? this.crouchH : this.standH;
    // velocidad deseada
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _v.set(0, 0, 0).addScaledVector(_f, -my).addScaledVector(_r, mx);
    if (_v.lengthSq() > 1) _v.normalize();
    let speed = 4.7 * def.move;
    if (this.sprint) speed = (this.perk === 'atleta' ? 7.4 : 6.9) * Math.min(1.04, def.move + 0.05);
    else if (this.crouch) speed = 2.4;
    if (ads) speed *= 0.6;
    if (this.slideT > 0) {
      this.slideT -= dt;
      const k = Math.max(0, this.slideT / 0.75);
      const sp = 3 + k * 6.5;
      this.vel.x = this.slideDir.x * sp; this.vel.z = this.slideDir.z * sp;
    } else {
      const accel = this.grounded ? 14 : 2.5;
      this.vel.x = damp(this.vel.x, _v.x * speed, accel, dt);
      this.vel.z = damp(this.vel.z, _v.z * speed, accel, dt);
    }
    // salto
    if (inp.wasPressed('jump')) {
      if (this.crouch && this.slideT <= 0) { if (this.canStand()) this.crouch = false; }
      else if (this.grounded) { this.vy = 5.3; this.grounded = false; this.slideT = 0; Audio.play('step1', { vol: 0.5 }); }
    }
    this.vy -= 16 * dt;
    if (this.grounded && this.vy < -1) this.vy = -1;
    const preVy = this.vy;
    const res = g.world.move(this.pos, this.vel.x * dt, this.vy * dt, this.vel.z * dt, this.radius, this.height, 0.46, this.grounded, _mres);
    const wasGrounded = this.grounded;
    this.grounded = res.ground;
    if (res.ground) { if (!wasGrounded && preVy < -6) { this.vm.land(-preVy); Audio.play('land', { vol: 0.7 }); this.landT = 0.25; } this.vy = Math.max(this.vy, -1); }
    if (res.ceiling) this.vy = Math.min(0, this.vy);
    // colisión blanda con otros soldados
    for (const c of g.combatants) {
      if (c === this || !c.alive || c.inVehicle) continue;
      const dx = this.pos.x - c.pos.x, dz = this.pos.z - c.pos.z;
      if (Math.abs(this.pos.y - c.pos.y) > 1.5) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.36 && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = 0.6 - d;
        const nx = this.pos.x + (dx / d) * push, nz = this.pos.z + (dz / d) * push;
        if (!g.world.overlapsSolid(nx - this.radius, this.pos.y + 0.1, nz - this.radius, nx + this.radius, this.pos.y + this.height, nz + this.radius)) { this.pos.x = nx; this.pos.z = nz; }
      }
    }
    this.moveSpeed = Math.hypot(this.vel.x, this.vel.z);
    // pasos
    if (this.grounded && this.moveSpeed > 1.2) {
      this.stepAcc += this.moveSpeed * dt;
      const stride = this.sprint ? 2.6 : this.crouch ? 1.5 : 2.1;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const quiet = this.perk === 'fantasma' ? 0.4 : 1;
        Audio.play('step' + Math.floor(Math.random() * 4), { vol: (this.crouch ? 0.18 : this.sprint ? 0.45 : 0.3) * quiet, jitter: 0.1 });
        if (!this.crouch) g.noise(this.pos, (this.sprint ? 16 : 9) * quiet, this, 'step');
      }
    }
    // altura de ojos suave
    this.eyeSmooth = damp(this.eyeSmooth, this.crouch ? (this.slideT > 0 ? 0.85 : 1.05) : 1.62, 12, dt);
    // regeneración
    if (t - this.lastDamageTime > 4.5 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 32 * dt);
    // ------------------ armas
    const wr = ws.update(t, dt);
    if (wr === 'reloaded') { /* animación ya terminada */ }
    for (const w of this.weapons) if (w !== ws) w.update(t, dt);
    // cambio
    let want = -1;
    if (inp.wasPressed('switch')) want = 1 - this.slot;
    if (inp.wasPressed('slot1')) want = 0;
    if (inp.wasPressed('slot2')) want = 1;
    if (want >= 0 && want !== this.slot && !this.switching && !this.nadeHold) this.switchTo(want);
    // recarga
    if (inp.wasPressed('reload') && !this.switching && !this.nadeHold) this.reload();
    // granadas
    this.updateGrenades(dt);
    // disparo
    this.adsT = damp(this.adsT, ads ? 1 : 0, 1 / Math.max(0.05, def.ads) * 2.6, dt);
    const wantFire = def.auto || inp.touchMode ? inp.isHeld('fire') : inp.wasPressed('fire');
    if (g.streaks.designating) { if (inp.wasPressed('fire')) g.streaks.confirmDesignation(this); }
    else if (wantFire && !this.switching && !this.nadeHold && t >= this.sprintOut && !this.sprint) {
      if (ws.reloading) { /* esperar */ }
      else if (ws.mag <= 0) {
        if (ws.reserve > 0) this.reload();
        else if (inp.wasPressed('fire') || !this._dryT || t - this._dryT > 0.4) { Audio.play('dry', { vol: 0.6 }); this._dryT = t; if (this.weapons[1 - this.slot].mag + this.weapons[1 - this.slot].reserve > 0) this.switchTo(1 - this.slot); }
      } else {
        let n = 0;
        while (ws.canFire(t) && n < 3) { this.fireOnce(ws, ads); n++; if (!def.auto && !inp.touchMode) break; }
      }
    }
    // recuperación del retroceso
    if (this.recoilAcc > 0) {
      const rec = Math.min(this.recoilAcc, def.recoil.rec * DEG * dt * (inp.isHeld('fire') ? 0.35 : 1));
      this.pitch -= rec; this.recoilAcc -= rec;
    }
    this.wasAds = ads;
    this.updateAimAssist(dt, ads, inp.isHeld('fire'));
    // interacción
    this.updateInteract(dt);
    // rachas
    for (let i = 0; i < 3; i++) if (inp.wasPressed('streak' + i)) g.streaks.activate(this, i);
    // viewmodel
    this.vm.update(dt, { ads, sprint: this.sprint, moveSpeed: this.grounded ? this.moveSpeed : 0, lookDX: look.dx, lookDY: look.dy, grounded: this.grounded, crouch: this.crouch, time: t });
    inp.setCounts(this.lethals, this.tacticals);
  }

  currentZoom() {
    const def = this.weapon.def;
    if (def.scope) return def.zoom;
    const om = OPTICS[this.weapon.optic] ? OPTICS[this.weapon.optic].zoomMul : 1;
    return def.zoom * (this.slot === 0 ? om : 1);
  }
  canStand() { return !this.game.world.overlapsSolid(this.pos.x - this.radius + 0.02, this.pos.y + 0.1, this.pos.z - this.radius + 0.02, this.pos.x + this.radius - 0.02, this.pos.y + this.standH, this.pos.z + this.radius - 0.02); }

  fireOnce(ws, ads) {
    const g = this.game, def = ws.def, t = g.time;
    ws.fire(t);
    const cam = g.camera;
    _o.copy(cam.position);
    cam.getWorldDirection(_t);
    const moving = this.moveSpeed > 1;
    const adsFull = this.adsT > 0.75;
    let spread = ws.spread(adsFull, moving, this.crouch, !this.grounded);
    if (!adsFull && this.adsT > 0.2) spread *= 1 - this.adsT * 0.6;
    // posición de boca aproximada para trazadoras
    const m = _v.copy(_o).addScaledVector(_t, 0.7);
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (!adsFull) m.addScaledVector(_r, 0.12).y -= 0.1; else m.y -= 0.04;
    const hit = g.combat.shoot(this, ws, _o, _t, spread, m);
    g.fx.flashLight(m, 0xffb060, 6, 0.05, 6);
    // retroceso
    const rmul = (adsFull ? 0.8 : 1) * (this.crouch ? 0.85 : 1);
    const kick = def.recoil.v * DEG * rmul * (0.85 + Math.random() * 0.3);
    this.pitch = clamp(this.pitch + kick, -1.45, 1.45);
    this.recoilAcc += kick;
    this.yaw += (Math.random() - 0.45) * def.recoil.h * DEG * rmul;
    this.vm.fire(def.recoil.v);
    g.shake(def.pellets > 1 || def.scope ? 0.18 : 0.04);
    if (def.model.type === 'shotgun') g.schedule(0.25, () => Audio.play('pump', { vol: 0.6 }));
    if (def.model.type === 'sniper') g.schedule(0.35, () => Audio.play('bolt', { vol: 0.7 }));
    if (hit && hit.actor) g.hud.markHit();
    if (ws.mag === 0 && ws.reserve > 0) g.schedule(0.25, () => { if (this.alive && this.weapon === ws && ws.mag === 0) this.reload(); });
  }

  reload() {
    const ws = this.weapon; const g = this.game;
    if (ws.reloading || this.switching) return;
    const empty = ws.mag === 0;
    const dur = ws.startReload(g.time, this.perk === 'manos' ? 0.65 : 1);
    if (!dur) return;
    this.vm.startReload(dur, empty);
    const id = ws.id;
    Audio.play('mag_out', { vol: 0.7 });
    g.schedule(dur * 0.62, () => { if (this.weapon.id === id && ws.reloading) Audio.play('mag_in', { vol: 0.8 }); });
    if (empty) g.schedule(dur * 0.9, () => { if (this.weapon.id === id && ws.reloading) Audio.play(ws.def.model.type === 'shotgun' ? 'pump' : 'bolt', { vol: 0.7 }); });
    g.noise(this.pos, 7, this, 'reload');
  }

  switchTo(slot) {
    const g = this.game;
    this.weapon.cancelReload(); this.vm.cancelReload();
    this.switching = true;
    const dur = this.weapons[slot].def.swap * (this.perk === 'manos' ? 0.65 : 1) + 0.25;
    Audio.play('swap', { vol: 0.6 });
    this.vm.startSwitch(dur, () => { this.slot = slot; this.equipViewModel(); });
    g.schedule(dur, () => { this.switching = false; });
  }

  // granadas: mantener = trayectoria, soltar = lanzar
  updateGrenades(dt) {
    const g = this.game, inp = g.input;
    for (const kind of ['lethal', 'tactical']) {
      if (inp.wasPressed(kind) && !this.nadeHold && !this.switching) {
        const count = kind === 'lethal' ? this.lethals : this.tacticals;
        if (count <= 0) { Audio.play('dry', { vol: 0.4 }); g.hud.notice('SIN ' + (kind === 'lethal' ? 'EXPLOSIVOS' : 'TÁCTICAS')); continue; }
        this.weapon.cancelReload(); this.vm.cancelReload();
        this.nadeHold = { kind, t: 0 };
        Audio.play('pin', { vol: 0.7 });
      }
    }
    if (this.nadeHold) {
      this.nadeHold.t += dt;
      const kind = this.nadeHold.kind;
      this.throwParams(_o, _t);
      g.projectiles.preview(_o, _t, kind === 'lethal' ? this.lethalDef : this.tacticalDef);
      if (!inp.isHeld(kind) || this.nadeHold.t > 4) {
        g.projectiles.hidePreview();
        if (kind === 'lethal') this.lethals--; else this.tacticals--;
        const def = kind === 'lethal' ? this.lethalDef : this.tacticalDef;
        g.projectiles.throw(this, def, _o, _t);
        this.vm.startThrow();
        Audio.play('throw', { vol: 0.7 });
        this.nadeHold = null;
        this.weapon.nextShot = Math.max(this.weapon.nextShot, g.time + 0.45);
      }
    }
  }
  throwParams(origin, vel) {
    const cam = this.game.camera;
    origin.copy(cam.position);
    cam.getWorldDirection(vel);
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    origin.addScaledVector(_r, 0.18).addScaledVector(vel, 0.35); origin.y -= 0.12;
    const p = clamp(this.pitch + 0.16, -1.2, 1.3);
    vel.set(-Math.sin(this.yaw) * Math.cos(p), Math.sin(p), -Math.cos(this.yaw) * Math.cos(p)).multiplyScalar(17);
    vel.x += this.vel.x * 0.5; vel.z += this.vel.z * 0.5;
  }

  updateInteract(dt) {
    const g = this.game, inp = g.input;
    const it = g.interactionFor(this);
    if (!it) { this.interactT = 0; this.interactKey = null; inp.setInteract(null); g.hud.interact(null); return; }
    if (it.key !== this.interactKey) { this.interactT = 0; this.interactKey = it.key; }
    if (it.instant) {
      if (inp.wasPressed('interact')) { it.action(); this.interactT = 0; }
      inp.setInteract(it.label, 0); g.hud.interact(it.label + (inp.touchMode ? '' : ' [E]'), 0);
      return;
    }
    if (inp.isHeld('interact')) {
      this.interactT += dt;
      if (it.onHold) it.onHold(this.interactT);
      if (this.interactT >= it.duration) { this.interactT = 0; it.action(); }
    } else { if (this.interactT > 0 && it.onCancel) it.onCancel(); this.interactT = 0; }
    const p = this.interactT / it.duration;
    inp.setInteract(it.label, p); g.hud.interact((inp.touchMode ? 'MANTÉN: ' : 'MANTÉN [E]: ') + it.label, p);
  }

  updateAimAssist(dt, ads, firing) {
    const g = this.game, A = g.settings.aimAssist;
    this.aimTarget = null;
    const snapNow = ads && !this.wasAdsSnap; this.wasAdsSnap = ads;
    if (A <= 0.01) return;
    this.aimCheckT -= dt;
    const cam = g.camera;
    cam.getWorldDirection(_f);
    let best = null, bestAng = (2.5 + 4.5 * A) * DEG * (ads ? 1.25 : 1);
    for (const c of g.combatants) {
      if (!c.alive || !g.isEnemy(c, this)) continue;
      c.chest(_t);
      _t.sub(cam.position);
      const d = _t.length();
      if (d > 70 || d < 0.5) continue;
      const ang = Math.acos(clamp(_t.dot(_f) / d, -1, 1));
      // ángulo mínimo con algo de margen por distancia (objetivos cercanos ocupan más)
      const eff = ang - Math.atan(0.35 / d);
      if (eff < bestAng) { bestAng = eff; best = c; }
    }
    if (!best) return;
    best.chest(_t);
    if (!g.world.los(cam.position.x, cam.position.y, cam.position.z, _t.x, _t.y, _t.z, 'sight') || g.fx.smokeBlocks(cam.position.x, cam.position.y, cam.position.z, _t.x, _t.y, _t.z)) return;
    this.aimTarget = best;
    // al apuntar: ajuste inicial; al disparar/apuntar: seguimiento suave
    _t.sub(cam.position);
    const wantYaw = Math.atan2(-_t.x, -_t.z);
    const wantPitch = Math.atan2(_t.y, Math.hypot(_t.x, _t.z));
    const dy = wrapAngle(wantYaw - this.yaw), dp = wantPitch - this.pitch;
    if (snapNow) { this.yaw += dy * 0.55 * A; this.pitch += dp * 0.45 * A; }
    if (ads || firing) {
      const rate = (ads ? 2.6 : 1.5) * A;
      this.yaw += dy * Math.min(1, rate * dt * 3);
      this.pitch += dp * Math.min(1, rate * dt * 2);
    }
  }
}
