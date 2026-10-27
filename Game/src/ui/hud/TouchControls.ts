import type { Input } from '../../core/Input';
import { clamp } from '../../core/MathUtil';
import { fillTriangle, h, haptic } from '../dom';

/**
 * On-screen driving controls with multi-touch: steering buttons or analog slider,
 * throttle, brake, handbrake, nitro and optional manual shift paddles.
 */
export class TouchControls {
  readonly el: HTMLDivElement;
  private mode: 'buttons' | 'slider' | 'tilt' = 'buttons';
  private nitroEl!: HTMLElement;
  private shiftEl!: HTMLElement;
  vibration = true;

  constructor(private input: Input) {
    this.el = h('div', { class: 'touch' });
    this.build();
    // detect touch devices; keyboards hide the controls until a touch happens
    const show = () => {
      this.input.touch.active = true;
      this.el.classList.remove('hidden');
    };
    if (!('ontouchstart' in window) && !navigator.maxTouchPoints) this.el.classList.add('hidden');
    addEventListener('touchstart', show, { passive: true });
  }

  setMode(m: 'buttons' | 'slider' | 'tilt') {
    this.mode = m;
    this.input.tilt = m === 'tilt';
    this.build();
  }

  setManual(manual: boolean) {
    this.shiftEl.classList.toggle('hidden', !manual);
  }

  setNitro(fitted: boolean, amount: number) {
    this.nitroEl.classList.toggle('hidden', !fitted);
    this.nitroEl.classList.toggle('empty', amount <= 0.02);
  }

  private hold(el: HTMLElement, on: (v: boolean) => void) {
    const ids = new Set<number>();
    const update = () => {
      const down = ids.size > 0;
      el.classList.toggle('down', down);
      on(down);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      ids.add(e.pointerId);
      if (this.vibration) haptic(8);
      update();
    });
    const up = (e: PointerEvent) => {
      ids.delete(e.pointerId);
      update();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  private build() {
    this.el.innerHTML = '';
    const t = this.input.touch;
    if (this.mode === 'buttons') {
      const l = h('div', { class: 'pad left', html: fillTriangle('left') });
      const r = h('div', { class: 'pad right', html: fillTriangle('right') });
      this.hold(l, (v) => (t.left = v));
      this.hold(r, (v) => (t.right = v));
      this.el.append(l, r);
    } else if (this.mode === 'slider') {
      const sl = h('div', { class: 'pad slider' });
      const knob = h('div', { class: 'knob' });
      sl.append(knob);
      let id = -1;
      const move = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        const rc = sl.getBoundingClientRect();
        const v = clamp(((e.clientX - rc.left) / rc.width) * 2 - 1, -1, 1);
        const shaped = Math.sign(v) * Math.pow(Math.abs(v), 1.3);
        t.steer = shaped;
        knob.style.left = `${((v + 1) / 2) * 100}%`;
      };
      sl.addEventListener('pointerdown', (e) => {
        id = e.pointerId;
        sl.setPointerCapture?.(e.pointerId);
        sl.classList.add('down');
        move(e);
      });
      sl.addEventListener('pointermove', move);
      const up = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        id = -1;
        t.steer = 0;
        knob.style.left = '50%';
        sl.classList.remove('down');
      };
      sl.addEventListener('pointerup', up);
      sl.addEventListener('pointercancel', up);
      this.el.append(sl);
    }
    const gas = h('div', { class: 'pad gas', html: fillTriangle('up') }, h('span', { class: 'lbl' }, 'GAS'));
    const brake = h('div', { class: 'pad brake', html: fillTriangle('down') }, h('span', { class: 'lbl' }, 'BRK'));
    const hb = h('div', { class: 'pad hb' }, h('span', { class: 'lbl', style: { position: 'static' } }, 'E-BRAKE'));
    this.nitroEl = h('div', { class: 'pad nos' }, h('span', { class: 'lbl', style: { position: 'static', color: '#7fd3ff' } }, 'NITRO'));
    this.hold(gas, (v) => (t.throttle = v ? 1 : 0));
    this.hold(brake, (v) => (t.brake = v ? 1 : 0));
    this.hold(hb, (v) => (t.handbrake = v));
    this.hold(this.nitroEl, (v) => (t.nitro = v));
    const up = h('div', { class: 'pad' }, '+');
    const dn = h('div', { class: 'pad' }, '−');
    up.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.trigger('shiftUp');
    });
    dn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.trigger('shiftDown');
    });
    this.shiftEl = h('div', { class: 'shift hidden' }, up, dn);
    this.el.append(gas, brake, hb, this.nitroEl, this.shiftEl);
  }
}
