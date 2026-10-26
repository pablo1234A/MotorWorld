import { clamp, moveTowards } from './MathUtil';

export type Action = 'camera' | 'reset' | 'pause' | 'map' | 'horn' | 'lookBack' | 'shiftUp' | 'shiftDown' | 'nitro' | 'handbrake' | 'interact' | 'photo';

/** Values written by the on-screen touch controls. */
export interface TouchState {
  active: boolean;
  steer: number; // -1..1 analog
  left: boolean;
  right: boolean;
  throttle: number;
  brake: number;
  handbrake: boolean;
  nitro: boolean;
}

/**
 * Unified input from keyboard, gamepad (Gamepad API), touch and device tilt.
 * Produces smoothed analog driving values plus edge-triggered actions.
 */
export class Input {
  steer = 0;
  throttle = 0;
  brake = 0;
  handbrake = false;
  nitro = false;
  readonly touch: TouchState = { active: false, steer: 0, left: false, right: false, throttle: 0, brake: 0, handbrake: false, nitro: false };
  private keys = new Set<string>();
  private pressed = new Set<Action>();
  private gpPrev: boolean[] = [];
  /** 0..1 user steering sensitivity */
  sensitivity = 0.6;
  tilt = false;
  private tiltValue = 0;
  lastDevice: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';
  enabled = true;

  constructor() {
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
      const a = KEYMAP[e.code];
      if (a && !e.repeat) this.pressed.add(a);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('deviceorientation', (e) => {
      if (e.beta === null || e.gamma === null) return;
      // landscape: beta is left/right tilt
      const landscape = Math.abs((screen.orientation?.angle ?? 90) % 180) === 90;
      const v = landscape ? (e.beta ?? 0) * Math.sign((screen.orientation?.angle ?? 90) === 90 ? 1 : -1) : (e.gamma ?? 0);
      this.tiltValue = clamp(v / 30, -1, 1);
    });
  }

  /** Trigger an action from UI buttons. */
  trigger(a: Action) {
    this.pressed.add(a);
  }

  consume(a: Action): boolean {
    const had = this.pressed.has(a);
    this.pressed.delete(a);
    return had;
  }

  clearActions() {
    this.pressed.clear();
  }

  key(code: string) {
    return this.keys.has(code);
  }

  update(dt: number) {
    if (!this.enabled) {
      this.steer = this.throttle = this.brake = 0;
      this.handbrake = this.nitro = false;
      return;
    }
    const k = (c: string) => this.keys.has(c);
    let steerT = 0, thr = 0, brk = 0, hb = false, nos = false;
    let analog = false;
    // keyboard
    const kl = k('ArrowLeft') || k('KeyA'), kr = k('ArrowRight') || k('KeyD');
    if (kl || kr) steerT = (kr ? 1 : 0) - (kl ? 1 : 0);
    if (k('ArrowUp') || k('KeyW')) thr = 1;
    if (k('ArrowDown') || k('KeyS')) brk = 1;
    if (k('Space')) hb = true;
    if (k('ShiftLeft') || k('ShiftRight') || k('KeyN')) nos = true;

    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] ?? 0;
      const dz = Math.abs(ax) > 0.12 ? (ax - Math.sign(ax) * 0.12) / 0.88 : 0;
      const rt = gp.buttons[7]?.value ?? 0, lt = gp.buttons[6]?.value ?? 0;
      if (Math.abs(dz) > 0 || rt > 0.05 || lt > 0.05) this.lastDevice = 'gamepad';
      if (Math.abs(dz) > Math.abs(steerT)) {
        steerT = Math.sign(dz) * Math.pow(Math.abs(dz), 1.4);
        analog = true;
      }
      thr = Math.max(thr, rt);
      brk = Math.max(brk, lt);
      if (gp.buttons[0]?.pressed) hb = true; // A
      if (gp.buttons[1]?.pressed) nos = true; // B
      const edge = (i: number, a: Action) => {
        const p = !!gp.buttons[i]?.pressed;
        if (p && !this.gpPrev[i]) this.pressed.add(a);
        this.gpPrev[i] = p;
      };
      edge(3, 'camera'); // Y
      edge(2, 'reset'); // X
      edge(9, 'pause'); // start
      edge(8, 'map'); // select
      edge(5, 'shiftUp'); // RB
      edge(4, 'shiftDown'); // LB
      edge(10, 'horn');
      edge(11, 'lookBack');
      edge(12, 'interact');
      break;
    }

    // touch
    const t = this.touch;
    if (t.active) {
      if (t.left || t.right) steerT = (t.right ? 1 : 0) - (t.left ? 1 : 0);
      else if (Math.abs(t.steer) > 0.01) {
        steerT = t.steer;
        analog = true;
      }
      thr = Math.max(thr, t.throttle);
      brk = Math.max(brk, t.brake);
      hb = hb || t.handbrake;
      nos = nos || t.nitro;
    }
    if (this.tilt && t.active) {
      steerT = this.tiltValue;
      analog = true;
    }

    // digital steering is ramped; sensitivity controls ramp speed and analog curve
    if (analog) this.steer = moveTowards(this.steer, steerT, dt * 8);
    else {
      const speed = steerT === 0 ? 5 : 1.6 + this.sensitivity * 3.2;
      const back = Math.sign(steerT) !== Math.sign(this.steer) && this.steer !== 0 ? 2.2 : 1;
      this.steer = moveTowards(this.steer, steerT, dt * speed * back);
    }
    this.throttle = moveTowards(this.throttle, thr, dt * 6);
    this.brake = moveTowards(this.brake, brk, dt * 8);
    this.handbrake = hb;
    this.nitro = nos;
  }
}

const KEYMAP: Record<string, Action> = {
  KeyC: 'camera',
  KeyR: 'reset',
  Escape: 'pause',
  KeyP: 'pause',
  KeyM: 'map',
  KeyH: 'horn',
  KeyB: 'lookBack',
  KeyE: 'shiftUp',
  KeyQ: 'shiftDown',
  KeyF: 'interact',
  Enter: 'interact',
  F2: 'photo',
};
