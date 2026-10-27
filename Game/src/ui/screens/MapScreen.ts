import { L, t } from '../../core/i18n';
import { clamp } from '../../core/MathUtil';
import { EVENT_COLORS, POI_COLORS } from '../../game/Discovery';
import type { GameApi } from '../../game/GameApi';
import { POIS, ZONES } from '../../world/WorldDef';
import { clear, h } from '../dom';
import { panelHead, type Screen } from '../UI';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

interface Pin {
  x: number;
  z: number;
  color: string;
  label: string;
  kind: string;
  id: string;
  known: boolean;
}

/** Full-screen interactive map: pan, pinch/wheel zoom, discovery fog, pins, GPS, fast travel. */
export class MapScreen implements Screen {
  el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private g2: CanvasRenderingContext2D;
  private info: HTMLElement;
  private cx = 0;
  private cz = 0;
  private zoom = 0.25; // screen px per metre
  private pins: Pin[] = [];
  private sel: Pin | null = null;
  returnTo: () => void = () => {};

  constructor(private g: GameApi) {
    this.canvas = h('canvas');
    this.g2 = this.canvas.getContext('2d')!;
    this.info = h('div', { class: 'mapinfo card hidden' });
    const legend = h('div', { class: 'maplegend card' });
    for (const [k, c] of [[t('events'), EVENT_COLORS.sprint], [t('workshop'), POI_COLORS.garage], [t('gas_station'), POI_COLORS.gas], [t('viewpoint'), POI_COLORS.viewpoint], [t('speed_trap'), POI_COLORS.speedtrap]] as [string, number][])
      legend.append(h('div', { class: 'li' }, h('span', { class: 'ic', style: { background: hex(c) } }), k));
    this.el = h('div', { class: 'mapscreen' }, this.canvas, h('div', { style: { position: 'absolute', left: '0', right: '0', top: '0', padding: 'calc(16px + var(--safe-t)) calc(20px + var(--safe-r)) 0 calc(20px + var(--safe-l))' } }, panelHead(t('map'), `${t('explored')} ${this.g.discovery.explorePercent.toFixed(1)}%`, () => this.returnTo())), legend, this.info);
    this.bind();
  }

  back() {
    this.returnTo();
    return true;
  }

  onShow() {
    const p = this.g.playerPos();
    this.cx = p.x;
    this.cz = p.z;
    this.zoom = 0.28;
    this.sel = null;
    this.info.classList.add('hidden');
    const head = this.el.querySelector('.phead .eyebrow');
    if (head) head.textContent = `${t('explored')} ${this.g.discovery.explorePercent.toFixed(1)}%`;
    this.buildPins();
    this.resize();
  }

  private buildPins() {
    const d = this.g.discovery;
    const prof = this.g.profile.data;
    this.pins = [];
    for (const s of d.starts) {
      const known = d.isKnown(s.def.id);
      this.pins.push({ x: s.x, z: s.z, color: hex(EVENT_COLORS[s.def.type]), label: known ? L(s.def.name) : '?', kind: 'event', id: s.def.id, known });
    }
    for (const p of POIS) {
      const known = prof.pois.includes(p.id) || p.kind === 'garage';
      if (!known && p.kind !== 'viewpoint') continue;
      this.pins.push({ x: p.x, z: p.z, color: hex(POI_COLORS[p.kind] ?? 0xffffff), label: p.name ? L(p.name) : t(p.kind === 'speedtrap' ? 'speed_trap' : p.kind === 'driftzone' ? 'drift_zone' : p.kind), kind: p.kind, id: p.id, known });
    }
  }

  private resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
  }

  private toScreen(x: number, z: number): [number, number] {
    const dpr = this.canvas.width / innerWidth;
    return [(innerWidth / 2 + (x - this.cx) * this.zoom) * dpr, (innerHeight / 2 + (z - this.cz) * this.zoom) * dpr];
  }

  private bind() {
    const pts = new Map<number, [number, number]>();
    let pinch = 0;
    let moved = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      moved = 0;
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.zoom = clamp(this.zoom * (d / pinch), 0.12, 3);
        pinch = d;
        moved += 10;
        return;
      }
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
      moved += Math.abs(dx) + Math.abs(dy);
      this.cx -= dx / this.zoom;
      this.cz -= dy / this.zoom;
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
      if (moved < 8 && pts.size === 0) this.pick(e.clientX, e.clientY);
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', () => pts.clear());
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = clamp(this.zoom * (e.deltaY > 0 ? 0.88 : 1.14), 0.12, 3);
    }, { passive: false });
    addEventListener('resize', () => this.el.classList.contains('on') && this.resize());
  }

  private pick(sx: number, sy: number) {
    const dpr = this.canvas.width / innerWidth;
    let best: Pin | null = null, bd = 30 * dpr;
    for (const p of this.pins) {
      const [x, y] = this.toScreen(p.x, p.z);
      const d = Math.hypot(x - sx * dpr, y - sy * dpr);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    this.sel = best;
    this.renderInfo();
  }

  private renderInfo() {
    const i = this.info;
    clear(i);
    const p = this.sel;
    if (!p) {
      i.classList.add('hidden');
      return;
    }
    i.classList.remove('hidden');
    i.append(h('div', { class: 'eyebrow', style: { color: p.color } }, p.kind === 'event' ? t('events') : p.kind), h('h3', {}, p.known ? p.label : t('undiscovered')));
    const actions = h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
    const gps = h('button', { class: 'btn ghost small' }, t('set_route'));
    gps.addEventListener('click', () => {
      this.g.setGps(p.x, p.z);
      this.returnTo();
    });
    actions.append(gps);
    // fast travel to discovered places (not during events)
    if (p.known && !this.g.inEvent) {
      const tr = h('button', { class: 'btn small' }, t('travel'));
      tr.addEventListener('click', () => this.g.travelTo(p.x, p.z));
      actions.append(tr);
    }
    if (p.kind === 'event' && p.known && !this.g.inEvent) {
      const st = h('button', { class: 'btn small' }, t('start_event'));
      st.addEventListener('click', () => this.g.startEvent(p.id));
      actions.append(st);
    }
    i.append(actions);
  }

  update() {
    const g = this.g2;
    const W = this.canvas.width, H = this.canvas.height;
    const dpr = W / innerWidth;
    g.fillStyle = '#071017';
    g.fillRect(0, 0, W, H);
    const m = this.g.map;
    const [x0, y0] = this.toScreen(-2048, -2048);
    const size = 4096 * this.zoom * dpr;
    g.imageSmoothingEnabled = this.zoom < 0.5;
    g.drawImage(m.canvas, x0, y0, size, size);
    // undiscovered zones: dark veil
    const zones = this.g.profile.data.zones;
    for (const z of ZONES) {
      if (zones.includes(z.id)) continue;
      const [x, y] = this.toScreen(z.x, z.z);
      const r = z.r * this.zoom * dpr;
      const grd = g.createRadialGradient(x, y, r * 0.2, x, y, r);
      grd.addColorStop(0, 'rgba(6,10,14,0.72)');
      grd.addColorStop(1, 'rgba(6,10,14,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // zone labels
    g.textAlign = 'center';
    g.font = `700 ${Math.round(13 * dpr)}px Rajdhani, sans-serif`;
    for (const z of ZONES) {
      const [x, y] = this.toScreen(z.x, z.z);
      g.fillStyle = zones.includes(z.id) ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)';
      g.fillText(L(z.name).toUpperCase(), x, y);
    }
    // pins
    for (const p of this.pins) {
      const [x, y] = this.toScreen(p.x, p.z);
      const r = (p === this.sel ? 9 : 6) * dpr;
      g.fillStyle = p.known ? p.color : 'rgba(150,150,160,0.8)';
      g.strokeStyle = '#000';
      g.lineWidth = 2 * dpr;
      g.beginPath();
      if (p.kind === 'event') {
        g.moveTo(x, y - r * 1.3);
        g.lineTo(x + r, y);
        g.lineTo(x, y + r * 1.3);
        g.lineTo(x - r, y);
        g.closePath();
      } else g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // player
    const pp = this.g.playerPos();
    const [px, py] = this.toScreen(pp.x, pp.z);
    g.save();
    g.translate(px, py);
    g.rotate(-pp.heading);
    g.fillStyle = '#fff';
    g.strokeStyle = '#e01a2b';
    g.lineWidth = 2.5 * dpr;
    g.beginPath();
    g.moveTo(0, -11 * dpr);
    g.lineTo(8 * dpr, 9 * dpr);
    g.lineTo(0, 4 * dpr);
    g.lineTo(-8 * dpr, 9 * dpr);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
