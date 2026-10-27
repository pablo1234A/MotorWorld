import { t } from '../../core/i18n';
import { clamp, formatMoney, formatTime } from '../../core/MathUtil';
import type { Input } from '../../core/Input';
import type { RaceHud } from '../../race/RaceSession';
import type { MapRender } from '../../world/MapRender';
import { h, icon } from '../dom';
import { Minimap, type MapMarker } from './Minimap';
import { TouchControls } from './TouchControls';

export interface HudFrame {
  speed: number; // m/s (forward)
  rpm: number;
  redline: number;
  gear: number;
  shifting: boolean;
  nitro: number;
  nitroFitted: boolean;
  units: 'kmh' | 'mph';
  x: number;
  z: number;
  heading: number;
  zone: string;
  clock: string;
  cash: number;
  markers: MapMarker[];
  route: { x: number[]; z: number[] } | null;
  others: { x: number; z: number; color: string }[];
  race: RaceHud | null;
  fps: number | null;
}

/**
 * In-game heads-up display (DOM overlay + two small canvases).
 */
export class Hud {
  readonly el: HTMLDivElement;
  readonly minimap: Minimap;
  readonly touch: TouchControls;
  private speedCanvas: HTMLCanvasElement;
  private sg: CanvasRenderingContext2D;
  private spdEl: HTMLElement;
  private unitEl: HTMLElement;
  private gearEl: HTMLElement;
  private zoneEl: HTMLElement;
  private clockEl: HTMLElement;
  private cashEl: HTMLElement;
  private raceEl: HTMLElement;
  private objEl: HTMLElement;
  private toastsEl: HTMLElement;
  private skillEl: HTMLElement;
  private promptEl: HTMLElement;
  private bigEl: HTMLElement;
  private fpsEl: HTMLElement;
  private nitroEl: HTMLElement;
  private flashEl: HTMLElement;
  private bigTimer = 0;
  private lastSpeedTxt = '';
  onPrompt?: () => void;

  constructor(map: MapRender, input: Input, actions: { pause: () => void; camera: () => void; map: () => void; reset: () => void }) {
    this.minimap = new Minimap(map);
    this.touch = new TouchControls(input);
    this.speedCanvas = h('canvas', { width: 460, height: 300 });
    this.sg = this.speedCanvas.getContext('2d')!;
    this.spdEl = h('div', { class: 'spd' }, '0');
    this.unitEl = h('div', { class: 'unit' }, 'KM/H');
    this.gearEl = h('div', { class: 'gear' }, 'N');
    this.zoneEl = h('div', { class: 'zone' });
    this.clockEl = h('div', { class: 'clock' });
    this.cashEl = h('div', { class: 'hudcash' });
    this.raceEl = h('div', { class: 'raceinfo hidden' });
    this.objEl = h('div', { class: 'objective hidden' });
    this.toastsEl = h('div', { class: 'toasts' });
    this.skillEl = h('div', { class: 'skill', style: { opacity: '0' } });
    this.promptEl = h('div', { class: 'prompt hidden' });
    this.bigEl = h('div', { class: 'bigmsg hidden' });
    this.fpsEl = h('div', { class: 'fps hidden' });
    this.nitroEl = h('i');
    this.flashEl = h('div', { class: 'flash' });
    const btn = (name: string, fn: () => void, label: string) => {
      const b = h('button', { class: 'hbtn', 'aria-label': label }, icon(name));
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
      return b;
    };
    this.el = h(
      'div',
      { class: 'hud' },
      this.flashEl,
      h('div', { class: 'tl' }, this.minimap.el, h('div', { class: 'hudinfo' }, this.zoneEl, this.clockEl)),
      h('div', { class: 'tc' }, this.raceEl, this.objEl),
      h('div', { class: 'tr' }, this.cashEl, btn('reset', actions.reset, t('reset_car')), btn('camera', actions.camera, t('camera')), btn('map', actions.map, t('map')), btn('pause', actions.pause, t('paused'))),
      this.toastsEl,
      this.touch.el,
      h('div', { class: 'speedo' }, this.speedCanvas, this.gearEl, this.spdEl, this.unitEl),
      h('div', { class: 'nitrobar' }, this.nitroEl),
      this.skillEl,
      this.promptEl,
      this.bigEl,
      this.fpsEl,
    );
    this.minimap.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      actions.map();
    });
  }

  setPrompt(label: string | null) {
    if (!label) {
      if (!this.promptEl.classList.contains('hidden')) this.promptEl.classList.add('hidden');
      return;
    }
    if (this.promptEl.dataset.label === label && !this.promptEl.classList.contains('hidden')) return;
    this.promptEl.dataset.label = label;
    this.promptEl.innerHTML = '';
    const b = h('button', { class: 'btn' }, label);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onPrompt?.();
    });
    this.promptEl.append(b);
    this.promptEl.classList.remove('hidden');
  }

  toast(kicker: string, value: string, extra?: string) {
    const el = h('div', { class: 'toast' }, h('div', { class: 'k' }, kicker), h('div', { class: 'v' }, value), extra ? h('div', { class: 'r' }, extra) : null);
    this.toastsEl.append(el);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstChild!.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3000);
  }

  big(text: string, ms = 1200, cls = '') {
    this.bigEl.className = 'bigmsg pop ' + cls;
    this.bigEl.textContent = text;
    void this.bigEl.offsetWidth;
    this.bigTimer = ms / 1000;
  }

  flash() {
    this.flashEl.classList.add('damageflash');
    requestAnimationFrame(() => requestAnimationFrame(() => this.flashEl.classList.remove('damageflash')));
  }

  skill(name: string | null, points: number, mult: number, timer: number, window: number) {
    if (!name || points <= 0) {
      this.skillEl.style.opacity = '0';
      return;
    }
    this.skillEl.style.opacity = '1';
    this.skillEl.innerHTML = `<div class="name">${t(name)}<span class="mult">x${mult.toFixed(1)}</span></div><div class="pts">${Math.round(points * mult).toLocaleString('en-US')}</div><div class="chainbar"><i style="width:${clamp(timer / window, 0, 1) * 100}%"></i></div>`;
  }

  setScale(s: number) {
    this.el.style.setProperty('--hud', String(s));
    document.documentElement.style.setProperty('--hud', String(s));
  }

  update(dt: number, f: HudFrame) {
    // speed & tacho
    const v = Math.abs(f.speed) * (f.units === 'mph' ? 2.23694 : 3.6);
    const txt = Math.round(v).toString();
    if (txt !== this.lastSpeedTxt) {
      this.spdEl.textContent = txt;
      this.lastSpeedTxt = txt;
    }
    this.unitEl.textContent = f.units === 'mph' ? 'MPH' : 'KM/H';
    const gear = f.gear < 0 ? 'R' : f.gear === 0 ? 'N' : String(f.gear);
    if (this.gearEl.textContent !== gear) this.gearEl.textContent = gear;
    const shiftLight = f.rpm > f.redline * 0.93 && f.gear > 0;
    this.gearEl.classList.toggle('shift', shiftLight);
    this.drawTacho(f.rpm, f.redline, f.nitro, f.nitroFitted);
    this.nitroEl.style.height = `${f.nitro * 100}%`;
    (this.nitroEl.parentElement as HTMLElement).classList.toggle('hidden', !f.nitroFitted);
    this.touch.setNitro(f.nitroFitted, f.nitro);
    this.touch.update();
    // info
    if (this.zoneEl.textContent !== f.zone) this.zoneEl.textContent = f.zone;
    this.clockEl.textContent = f.clock;
    this.cashEl.textContent = formatMoney(f.cash);
    this.minimap.draw(f.x, f.z, f.heading, Math.abs(f.speed), f.markers, f.route, f.others);
    // race
    const r = f.race;
    if (r) {
      this.raceEl.classList.remove('hidden');
      const boxes: string[] = [];
      if (r.total > 1) boxes.push(`<div class="box"><span class="k">${t('position')}</span><span class="v">${r.position}<small>/${r.total}</small></span></div>`);
      if (r.laps > 1) boxes.push(`<div class="box"><span class="k">${t('lap')}</span><span class="v">${r.lap}<small>/${r.laps}</small></span></div>`);
      if (r.timer !== null) boxes.push(`<div class="box"><span class="k">${t('time')}</span><span class="v" style="color:${r.timer < 10 ? 'var(--red-hot)' : '#fff'}">${r.timer.toFixed(1)}</span></div>`);
      else boxes.push(`<div class="box"><span class="k">${t('time')}</span><span class="v">${formatTime(r.time)}</span></div>`);
      if (r.score !== null) boxes.push(`<div class="box"><span class="k">${t('score')}</span><span class="v">${r.score.toLocaleString('en-US')}</span></div>`);
      if (r.busted > 0) boxes.push(`<div class="box"><span class="k">${t('busted')}</span><span class="v" style="color:var(--red-hot)">${Math.round(r.busted * 100)}%</span></div>`);
      this.raceEl.innerHTML = boxes.join('');
      this.objEl.classList.toggle('hidden', !r.objective && !r.wrongWay);
      this.objEl.textContent = r.wrongWay ? t('wrong_way') : r.objective;
      this.objEl.classList.toggle('wrongway', r.wrongWay);
    } else {
      this.raceEl.classList.add('hidden');
      this.objEl.classList.add('hidden');
    }
    if (this.bigTimer > 0) {
      this.bigTimer -= dt;
      this.bigEl.classList.remove('hidden');
      if (this.bigTimer <= 0) this.bigEl.classList.add('hidden');
    }
    if (f.fps !== null) {
      this.fpsEl.classList.remove('hidden');
      this.fpsEl.textContent = `${f.fps.toFixed(0)} FPS`;
    } else this.fpsEl.classList.add('hidden');
  }

  private drawTacho(rpm: number, redline: number, nitro: number, nitroFitted: boolean) {
    const g = this.sg;
    const W = 460, H = 300;
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = 190, R = 165;
    const a0 = Math.PI * 0.82, a1 = Math.PI * 2.18;
    const maxRpm = Math.ceil((redline + 800) / 1000) * 1000;
    const ang = (r: number) => a0 + (a1 - a0) * clamp(r / maxRpm, 0, 1);
    // background arc
    g.lineCap = 'butt';
    g.lineWidth = 16;
    g.strokeStyle = 'rgba(10,10,14,0.55)';
    g.beginPath();
    g.arc(cx, cy, R, a0, a1);
    g.stroke();
    // redline zone
    g.strokeStyle = 'rgba(224,26,43,0.55)';
    g.beginPath();
    g.arc(cx, cy, R, ang(redline), a1);
    g.stroke();
    // value arc
    const grd = g.createLinearGradient(cx - R, 0, cx + R, 0);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.75, '#ffffff');
    grd.addColorStop(1, '#ff3446');
    g.strokeStyle = rpm > redline * 0.93 ? '#ff3446' : grd;
    g.lineWidth = 10;
    g.beginPath();
    g.arc(cx, cy, R, a0, ang(rpm));
    g.stroke();
    // ticks
    g.lineWidth = 2;
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.font = '600 18px Rajdhani, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let k = 0; k <= maxRpm; k += 1000) {
      const a = ang(k);
      g.strokeStyle = k >= redline ? '#ff3446' : 'rgba(255,255,255,0.65)';
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14));
      g.lineTo(cx + Math.cos(a) * (R - 24), cy + Math.sin(a) * (R - 24));
      g.stroke();
      g.fillText(String(k / 1000), cx + Math.cos(a) * (R - 38), cy + Math.sin(a) * (R - 38));
    }
    // nitro arc (inner)
    if (nitroFitted) {
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(30,144,255,0.25)';
      g.beginPath();
      g.arc(cx, cy, R - 54, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
      g.strokeStyle = '#4fb3ff';
      g.beginPath();
      g.arc(cx, cy, R - 54, Math.PI * 1.15, Math.PI * 1.15 + Math.PI * 0.7 * nitro);
      g.stroke();
    }
  }
}
