import { view } from './util.js';
// Entrada: controles táctiles multitáctiles (joystick flotante + zona de mirada + botones)
// y teclado/ratón con bloqueo de puntero para escritorio.

const BTN_HTML = `
<div class="joy-zone"></div>
<div class="joy" id="joy"><div class="joy-knob" id="joyKnob"></div></div>
<button class="tbtn fire" data-btn="fire" aria-label="Disparar"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 4v10M24 34v10M4 24h10M34 24h10" stroke="currentColor" stroke-width="3"/></svg></button>
<button class="tbtn fire2" data-btn="fire" aria-label="Disparar"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 4v10M24 34v10M4 24h10M34 24h10" stroke="currentColor" stroke-width="3"/></svg></button>
<button class="tbtn ads" data-btn="ads" aria-label="Apuntar"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="24" cy="24" r="3" fill="currentColor"/></svg></button>
<button class="tbtn jump" data-btn="jump" aria-label="Saltar"><svg viewBox="0 0 48 48"><path d="M10 30 24 14l14 16" fill="none" stroke="currentColor" stroke-width="4"/><path d="M10 38h28" stroke="currentColor" stroke-width="3"/></svg></button>
<button class="tbtn crouch" data-btn="crouch" aria-label="Agacharse"><svg viewBox="0 0 48 48"><path d="M10 18 24 32l14-14" fill="none" stroke="currentColor" stroke-width="4"/><path d="M10 38h28" stroke="currentColor" stroke-width="3"/></svg></button>
<button class="tbtn reload" data-btn="reload" aria-label="Recargar"><svg viewBox="0 0 48 48"><path d="M36 18a13 13 0 1 0 2 10" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M38 8v11H27" fill="none" stroke="currentColor" stroke-width="3.5"/></svg></button>
<button class="tbtn sprint" data-btn="sprint" aria-label="Esprintar"><svg viewBox="0 0 48 48"><path d="M8 14h16l-6 10h14l-6 12" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M30 14h10M34 24h8" stroke="currentColor" stroke-width="3"/></svg></button>
<button class="tbtn lethal" data-btn="lethal" aria-label="Granada"><svg viewBox="0 0 48 48"><ellipse cx="24" cy="28" rx="10" ry="12" fill="none" stroke="currentColor" stroke-width="3"/><path d="M20 15h8v-4h-8zM28 12l7-3" fill="none" stroke="currentColor" stroke-width="3"/></svg><span class="cnt" id="tLethal">1</span></button>
<button class="tbtn tactical" data-btn="tactical" aria-label="Táctica"><svg viewBox="0 0 48 48"><rect x="16" y="14" width="16" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="3"/><path d="M19 22h10M19 28h10" stroke="currentColor" stroke-width="3"/></svg><span class="cnt" id="tTact">1</span></button>
<button class="tbtn interact hidden" data-btn="interact" id="tInteract" aria-label="Interactuar"><span id="tInteractLbl">USAR</span><i class="ring" id="tInteractRing"></i></button>
`;

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyC: 'crouch', ControlLeft: 'crouch', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyR: 'reload',
  KeyQ: 'switch', Digit1: 'slot1', Digit2: 'slot2', KeyG: 'lethal', KeyT: 'tactical', KeyE: 'interact', KeyF: 'interact',
  Digit3: 'streak0', Digit4: 'streak1', Digit5: 'streak2', Tab: 'score', Escape: 'pause', KeyP: 'pause', KeyM: 'map',
};

export class Input {
  constructor(layer, settings) {
    this.layer = layer; this.settings = settings;
    this.move = { x: 0, y: 0 }; this.joyMag = 0; this.joyForwardTime = 0;
    this.lookDX = 0; this.lookDY = 0; this.lookSrc = 'touch';
    this.held = new Set(); this.pressed = new Set(); this.released = new Set();
    this.keys = new Set();
    this.touches = new Map();
    this.adsToggle = false;
    this.enabled = true;
    this.touchMode = false;
    this.locked = false;
    layer.innerHTML = BTN_HTML;
    this.joy = layer.querySelector('#joy'); this.knob = layer.querySelector('#joyKnob');
    this.joyRest();
    this._down = this.onDown.bind(this); this._move = this.onMove.bind(this); this._up = this.onUp.bind(this);
    this._kd = this.onKey.bind(this, true); this._ku = this.onKey.bind(this, false);
    this._mm = this.onMouseMove.bind(this); this._md = this.onMouseDown.bind(this); this._mu = this.onMouseUp.bind(this);
    this._wheel = (e) => { if (this.locked) { this.press('switch'); e.preventDefault(); } };
    this._plc = () => { this.locked = document.pointerLockElement === this.lockTarget; this.lockTime = performance.now(); if (!this.locked) { this.held.delete('fire'); this.held.delete('ads'); if (this.onUnlock) this.onUnlock(); } };
    window.addEventListener('pointerdown', this._down, { passive: false });
    window.addEventListener('pointermove', this._move, { passive: false });
    window.addEventListener('pointerup', this._up, { passive: false });
    window.addEventListener('pointercancel', this._up, { passive: false });
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('mousemove', this._mm);
    window.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    window.addEventListener('wheel', this._wheel, { passive: false });
    document.addEventListener('pointerlockchange', this._plc);
    // si el navegador (p. ej. dentro de un iframe) no permite bloquear el puntero, pasar a controles en pantalla
    this._ple = () => { this.lockFailed = true; if (!this.touchMode) { this.setTouchMode(true); if (this.onLockFail) this.onLockFail(); } };
    document.addEventListener('pointerlockerror', this._ple);
    this._blockCtx = (e) => e.preventDefault();
    window.addEventListener('contextmenu', this._blockCtx);
    this.setTouchMode(this.detectTouch());
  }
  detectTouch() {
    if (this.lockFailed) return true;
    const s = this.settings.touchControls;
    if (s === 'on') return true;
    if (s === 'off') return false;
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  }
  setTouchMode(on) {
    this.touchMode = on;
    this.layer.classList.toggle('hidden', !on);
    this.layer.classList.toggle('left-fire', !!this.settings.leftFire);
  }
  destroy() {
    window.removeEventListener('pointerdown', this._down); window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up); window.removeEventListener('pointercancel', this._up);
    window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku);
    window.removeEventListener('mousemove', this._mm); window.removeEventListener('mousedown', this._md); window.removeEventListener('mouseup', this._mu);
    window.removeEventListener('wheel', this._wheel); document.removeEventListener('pointerlockchange', this._plc); document.removeEventListener('pointerlockerror', this._ple);
    window.removeEventListener('contextmenu', this._blockCtx);
    if (document.pointerLockElement) document.exitPointerLock();
    this.layer.innerHTML = '';
  }
  requestLock(el) {
    if (this.touchMode || this.lockFailed) return;
    if (!el.requestPointerLock) { this._ple(); return; }
    this.lockTarget = el;
    try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => this._ple()); } catch (e) { this._ple(); }
  }

  press(name) { this.pressed.add(name); this.held.add(name); }
  release(name) { this.held.delete(name); this.released.add(name); }
  wasPressed(n) { if (this.pressed.has(n)) { this.pressed.delete(n); return true; } return false; }
  wasReleased(n) { if (this.released.has(n)) { this.released.delete(n); return true; } return false; }
  isHeld(n) { return this.held.has(n); }
  endFrame() { this.pressed.clear(); this.released.clear(); }
  clearAll() { this.held.clear(); this.pressed.clear(); this.released.clear(); this.keys.clear(); this.move.x = this.move.y = 0; this.joyMag = 0; this.adsToggle = false; this.touches.clear(); this.joyRest(); this.layer.querySelectorAll('.on').forEach((e) => e.classList.remove('on')); }
  consumeLook() { const r = { dx: this.lookDX, dy: this.lookDY, src: this.lookSrc }; this.lookDX = 0; this.lookDY = 0; return r; }
  get ads() { return this.settings.adsMode === 'toggle' ? this.adsToggle : this.held.has('ads'); }

  joyRest() {
    this.joy.classList.remove('active');
    this.joy.style.left = ''; this.joy.style.top = '';
    this.knob.style.transform = 'translate(-50%,-50%)';
  }

  // ---------------- táctil
  onDown(e) {
    if (!this.enabled || !this.touchMode || e.pointerType === 'mouse' && !this.touchMode) return;
    if (e.target.closest('.menu-layer, .modal, .pause-btn, .hud-click')) return;
    const btn = e.target.closest('[data-btn]');
    e.preventDefault();
    const [lx, ly] = view.toLocal(e.clientX, e.clientY);
    if (btn) {
      const name = btn.dataset.btn;
      this.touches.set(e.pointerId, { kind: 'btn', name, x: lx, y: ly, el: btn });
      btn.classList.add('on');
      if (name === 'ads') { if (this.settings.adsMode === 'toggle') this.adsToggle = !this.adsToggle; this.press('ads'); }
      else this.press(name);
      if (this.settings.haptics && navigator.vibrate && (name === 'fire')) { try { navigator.vibrate(8); } catch (err) { /* */ } }
      return;
    }
    const W = view.w;
    if (lx < W * 0.42 && ![...this.touches.values()].some((t) => t.kind === 'joy')) {
      this.touches.set(e.pointerId, { kind: 'joy', ox: lx, oy: ly, x: lx, y: ly });
      this.joy.classList.add('active');
      this.joy.style.left = lx + 'px'; this.joy.style.top = ly + 'px';
      this.knob.style.transform = 'translate(-50%,-50%)';
      return;
    }
    this.touches.set(e.pointerId, { kind: 'look', x: lx, y: ly });
  }
  onMove(e) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    const [cx, cy] = view.toLocal(e.clientX, e.clientY);
    if (t.kind === 'joy') {
      const R = 58 * (this.settings.hudScale || 1);
      let dx = cx - t.ox, dy = cy - t.oy;
      const L = Math.hypot(dx, dy);
      // joystick flotante: si te pasas, el centro te sigue
      if (L > R * 1.6) { const k = (L - R * 1.6) / L; t.ox += dx * k; t.oy += dy * k; dx = cx - t.ox; dy = cy - t.oy; this.joy.style.left = t.ox + 'px'; this.joy.style.top = t.oy + 'px'; }
      const L2 = Math.hypot(dx, dy); const m = Math.min(1, L2 / R);
      this.move.x = L2 > 0 ? (dx / L2) * m : 0; this.move.y = L2 > 0 ? (dy / L2) * m : 0;
      this.joyMag = L2 / R;
      const kx = Math.min(L2, R) * (L2 > 0 ? dx / L2 : 0), ky = Math.min(L2, R) * (L2 > 0 ? dy / L2 : 0);
      this.knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    } else if (t.kind === 'look' || (t.kind === 'btn' && t.name === 'fire')) {
      this.lookDX += cx - t.x; this.lookDY += cy - t.y; this.lookSrc = 'touch';
      t.x = cx; t.y = cy;
    } else if (t.kind === 'btn' && (t.name === 'lethal' || t.name === 'tactical')) {
      this.lookDX += (cx - t.x) * 0.6; this.lookDY += (cy - t.y) * 0.6; this.lookSrc = 'touch';
      t.x = cx; t.y = cy;
    }
  }
  onUp(e) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    this.touches.delete(e.pointerId);
    if (t.kind === 'joy') { this.move.x = this.move.y = 0; this.joyMag = 0; this.joyRest(); }
    else if (t.kind === 'btn') {
      t.el.classList.remove('on');
      // otro dedo podría seguir sobre el mismo botón
      if (![...this.touches.values()].some((o) => o.kind === 'btn' && o.name === t.name)) this.release(t.name);
    }
  }

  // ---------------- teclado / ratón
  onKey(down, e) {
    if (!this.enabled) return;
    const a = KEYMAP[e.code];
    if (!a) return;
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (down) {
      if (this.keys.has(e.code)) return;
      this.keys.add(e.code);
      if (['up', 'down', 'left', 'right'].includes(a)) { this.updateKeyMove(); return; }
      this.press(a);
    } else {
      this.keys.delete(e.code);
      if (['up', 'down', 'left', 'right'].includes(a)) { this.updateKeyMove(); return; }
      this.release(a);
    }
  }
  updateKeyMove() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    const L = Math.hypot(x, y) || 1;
    this.move.x = x / L; this.move.y = y / L; this.joyMag = (x || y) ? 1 : 0;
  }
  onMouseMove(e) {
    if (!this.enabled || !this.locked) return;
    // Chrome puede emitir un salto enorme justo al bloquear el puntero: se descarta
    if (performance.now() - (this.lockTime || 0) < 150) return;
    if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
    this.lookDX += e.movementX; this.lookDY += e.movementY; this.lookSrc = 'mouse';
  }
  onMouseDown(e) {
    if (!this.enabled || !this.locked) return;
    if (e.button === 0) this.press('fire');
    else if (e.button === 2) { if (this.settings.adsMode === 'toggle') this.adsToggle = !this.adsToggle; this.press('ads'); }
  }
  onMouseUp(e) {
    if (!this.locked) return;
    if (e.button === 0) this.release('fire');
    else if (e.button === 2) this.release('ads');
  }
  setInteract(label, progress) {
    const b = this.layer.querySelector('#tInteract');
    if (!b) return;
    b.classList.toggle('hidden', !label);
    if (label) {
      this.layer.querySelector('#tInteractLbl').textContent = label;
      this.layer.querySelector('#tInteractRing').style.setProperty('--p', Math.round((progress || 0) * 100));
    }
  }
  setCounts(l, t) {
    const a = this.layer.querySelector('#tLethal'), b = this.layer.querySelector('#tTact');
    if (a && a.textContent !== String(l)) a.textContent = l;
    if (b && b.textContent !== String(t)) b.textContent = t;
  }
}
