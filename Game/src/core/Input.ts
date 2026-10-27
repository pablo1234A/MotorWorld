import { clamp, lerp, moveTowards, smoothstep } from './MathUtil';

export type Action = 'camera' | 'reset' | 'pause' | 'map' | 'horn' | 'lookBack' | 'shiftUp' | 'shiftDown' | 'nitro' | 'handbrake' | 'interact' | 'photo' | 'indLeft' | 'indRight' | 'hazard' | 'gearMode' | 'mirrors';

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
  /** true once the device has reported orientation data (phones with a gyroscope/accelerometer) */
  tiltAvailable = false;
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
      this.tiltAvailable = true;
      const angle = screen.orientation?.angle ?? ((((window as any).orientation ?? 0) + 360) % 360);
      // light low-pass: sensor noise must not make the car twitch, but the response stays immediate
      this.tiltValue += (tiltSteer(e.beta, e.gamma, angle, this.sensitivity) - this.tiltValue) * 0.45;
    });
  }

  /** iOS asks for permission to read the motion sensors; must be called from a user gesture. */
  static async requestTiltPermission(): Promise<boolean> {
    const D = (window as any).DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      try {
        return (await D.requestPermission()) === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  }

  /** Current tilt steering (-1..1), for the on-screen wheel indicator. */
  get tiltSteer() {
    return this.tiltValue;
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
      edge(14, 'indLeft'); // d-pad left
      edge(15, 'indRight'); // d-pad right
      edge(13, 'gearMode'); // d-pad down
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
    if (this.tilt && t.active && this.tiltAvailable && !t.left && !t.right) {
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
  KeyZ: 'indLeft',
  KeyX: 'indRight',
  KeyV: 'hazard',
  KeyG: 'gearMode',
  KeyK: 'mirrors',
};

/**
 * Steering-wheel tilt: the phone is turned like a wheel, clockwise (right side down) steers right.
 * Uses the gravity direction in screen space, which is the same for any valid (beta, gamma) pair and works
 * whether the phone is held upright, tipped back or lying flat (then rolling it right also steers right).
 * Returns -1..1, linear in the wheel angle: full lock at 25..60 degrees depending on sensitivity, 1.5 degree dead zone.
 */
export function tiltSteer(betaDeg: number, gammaDeg: number, screenAngleDeg: number, sensitivity = 0.6): number {
  const d = Math.PI / 180;
  const b = betaDeg * d, g = gammaDeg * d, a = screenAngleDeg * d;
  // world "up" in device coordinates (W3C DeviceOrientation Z-X'-Y'' Euler angles)
  const ux = -Math.sin(g) * Math.cos(b), uy = Math.sin(b);
  // up vector in screen coordinates (x to the right of the screen as currently displayed)
  const sx = ux * Math.cos(a) - uy * Math.sin(a);
  const sy = ux * Math.sin(a) + uy * Math.cos(a);
  // turning clockwise moves "up" towards the left edge of the screen. Held up (any pitch) the wheel angle is
  // read in the screen plane; nearly flat that rotation is unobservable, so it blends to the roll angle.
  const wheel = Math.atan2(-sx, Math.max(sy, 0));
  const roll = Math.asin(clamp(-sx, -1, 1));
  const angle = lerp(roll, wheel, smoothstep(0.12, 0.4, sy)) / d;
  // proportional, like a real wheel: a little turn gives a little steering, a big turn full lock
  const dead = 1.5;
  const mag = Math.max(0, Math.abs(angle) - dead);
  const full = lerp(60, 25, clamp(sensitivity, 0, 1));
  return Math.sign(angle) * clamp(mag / (full - dead), 0, 1);
}
