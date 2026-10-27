import { L, t } from '../../core/i18n';
import { formatMoney, formatTime } from '../../core/MathUtil';
import type { GameApi } from '../../game/GameApi';
import { levelFromXp, xpForLevel } from '../../progression/Profile';
import { getCar } from '../../vehicles/CarCatalog';
import { h } from '../dom';
import type { Screen } from '../UI';

const TIPS: [string, string][] = [
  ['Mantén el freno parado para dar marcha atrás.', 'Hold brake while stopped to reverse.'],
  ['El freno de mano bloquea las ruedas traseras: perfecto para horquillas y drift.', 'The handbrake locks the rear wheels: perfect for hairpins and drifting.'],
  ['Cada pieza de rendimiento cambia la física real del coche.', 'Every performance part changes the car’s real physics.'],
  ['La lluvia reduce el agarre: los charcos todavía más.', 'Rain reduces grip, puddles even more.'],
  ['Los coches de propulsión sobrevirán al acelerar; los de tracción delantera subvirán.', 'Rear-drive cars oversteer under power; front-drivers understeer.'],
  ['Explora las carreteras para descubrir eventos, miradores y talleres.', 'Explore the roads to discover events, lookouts and workshops.'],
  ['Encadena derrapes, saltos y adelantamientos al límite para multiplicar los puntos.', 'Chain drifts, jumps and near misses to multiply your points.'],
];

export class LoadingScreen implements Screen {
  el: HTMLElement;
  private fill: HTMLElement;
  private label: HTMLElement;
  private pct: HTMLElement;
  private bottom: HTMLElement;
  onStart?: () => void;
  constructor() {
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    this.fill = h('div', { class: 'fill' });
    this.label = h('span', {}, t('loading'));
    this.pct = h('span', {}, '0%');
    const lines = h('div', { class: 'speedlines' });
    for (let i = 0; i < 14; i++) {
      const s = h('span');
      s.style.top = `${Math.random() * 100}%`;
      s.style.width = `${20 + Math.random() * 40}vw`;
      s.style.animationDelay = `${-Math.random() * 1.6}s`;
      s.style.animationDuration = `${1.2 + Math.random()}s`;
      lines.append(s);
    }
    this.bottom = h('div', { class: 'loadbar' }, h('div', { class: 'lbl' }, this.label, this.pct), h('div', { class: 'track' }, this.fill));
    this.el = h(
      'div',
      { class: 'loading' },
      lines,
      h('div', { class: 'brand' }, logo()),
      this.bottom,
      h('div', { class: 'tip' }, h('div', { class: 'eyebrow', style: { justifyContent: 'flex-end' } }, 'TIP'), document.createTextNode(tip[document.documentElement.lang === 'en' ? 1 : 0])),
    );
  }
  progress(p: number, label: string) {
    this.fill.style.width = `${Math.round(p * 100)}%`;
    this.pct.textContent = `${Math.round(p * 100)}%`;
    this.label.textContent = label;
  }
  ready() {
    this.bottom.innerHTML = '';
    const b = h('button', { class: 'tapstart' }, t('tap_start'));
    this.bottom.append(b);
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      this.el.removeEventListener('pointerup', go);
      removeEventListener('keydown', go);
      this.onStart?.();
    };
    this.el.addEventListener('pointerup', go);
    addEventListener('keydown', go);
  }
}

export function logo(): HTMLElement {
  return h('div', { class: 'logo' }, h('div', { class: 'mw', html: 'MOTOR<b>WORLD</b><i></i>' }), h('div', { class: 'sub' }, 'OPEN ROAD'));
}

export class MainMenu implements Screen {
  el: HTMLElement;
  private card: HTMLElement;
  private chips: HTMLElement;
  constructor(private g: GameApi) {
    const items: [string, string, () => void, boolean?][] = [
      ['play', 'play_sub', () => g.play(), true],
      ['garage', 'garage_sub', () => g.open('garage')],
      ['cars', 'cars_sub', () => g.open('dealer')],
      ['events', 'events_sub', () => g.open('events')],
      ['map', 'map_sub', () => g.open('map')],
      ['settings', 'settings_sub', () => g.open('settings')],
    ];
    const nav = h('nav');
    items.forEach(([k, sub, fn, primary], i) => {
      const b = h('button', { class: 'mitem' + (primary ? ' primary' : '') }, h('span', { class: 'n' }, `0${i + 1}`), h('span', { class: 't' }, t(k)), h('span', { class: 's' }, t(sub)));
      b.style.transitionDelay = `${0.05 + i * 0.05}s`;
      b.addEventListener('click', fn);
      b.addEventListener('pointerenter', () => g.sound('hover'));
      nav.append(b);
    });
    this.card = h('div', { class: 'playercard' });
    this.chips = h('div', { class: 'topbar' });
    this.el = h('div', { class: 'menu' }, h('div', { class: 'scrim' }), h('div', { class: 'left' }, logo(), nav, h('div')), this.chips, this.card);
  }
  onShow() {
    const p = this.g.profile;
    const lvl = levelFromXp(p.data.xp);
    const a = xpForLevel(lvl), b = xpForLevel(lvl + 1);
    const frac = (p.data.xp - a) / Math.max(1, b - a);
    const car = getCar(p.currentCar.carId);
    const C = 2 * Math.PI * 24;
    this.card.innerHTML = '';
    this.card.append(
      h('div', { class: 'ring', html: `<svg viewBox="0 0 54 54"><circle cx="27" cy="27" r="24" stroke="rgba(255,255,255,.12)" stroke-width="3" fill="none"/><circle cx="27" cy="27" r="24" stroke="#e01a2b" stroke-width="3" fill="none" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}" stroke-linecap="round"/></svg>` }, h('div', { class: 'lv' }, h('div', {}, h('small', {}, t('level').toUpperCase()), String(lvl)))),
      h('div', { class: 'pc-info' }, h('div', { class: 'pc-cash' }, formatMoney(p.data.cash)), h('div', { class: 'pc-car', html: `${t('current_car')}: <b>${car.brand} ${car.model}</b>` }), h('div', { class: 'pc-car' }, `${t('explored')}: ${this.g.discovery.explorePercent.toFixed(1)}% · ${t('wins')}: ${p.data.stats.wins}`)),
    );
    this.chips.innerHTML = '';
    this.chips.append(h('div', { class: 'chip' }, h('span', { class: 'dot' }), h('b', {}, this.g.env.clock)), h('div', { class: 'chip' }, t(this.g.env.weather)));
    this.g.audio.startMusic();
  }
  onHide() {
    this.g.audio.stopMusic();
  }
}

export class PauseScreen implements Screen {
  el: HTMLElement;
  private list: HTMLElement;
  constructor(private g: GameApi) {
    this.list = h('nav', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
    this.el = h('div', { class: 'menu' }, h('div', { class: 'scrim full' }), h('div', { class: 'left' }, h('div', {}, h('div', { class: 'eyebrow' }, 'MOTORWORLD'), h('h1', { class: 'display', style: { fontSize: 'clamp(40px,9vh,80px)' } }, t('paused'))), this.list, h('div')));
  }
  onShow() {
    const g = this.g;
    const items: [string, () => void][] = [[t('resume'), () => g.resume()]];
    if (g.inEvent) items.push([t('restart'), () => g.retryEvent()], [t('quit_event'), () => g.quitEvent()]);
    else items.push([t('reset_car'), () => g.resetCar()], [t('garage'), () => g.open('garage')], [t('map'), () => g.open('map')]);
    items.push([t('settings'), () => g.open('settings')], [t('main_menu'), () => g.toMenu()]);
    this.list.innerHTML = '';
    items.forEach(([label, fn], i) => {
      const b = h('button', { class: 'mitem' }, h('span', { class: 'n' }, `0${i + 1}`), h('span', { class: 't', style: { fontSize: 'clamp(24px,5vh,40px)' } }, label));
      b.addEventListener('click', fn);
      this.list.append(b);
    });
  }
  back() {
    this.g.resume();
    return true;
  }
}

export class ResultsScreen implements Screen {
  el: HTMLElement;
  private box: HTMLElement;
  constructor(private g: GameApi) {
    this.box = h('div', { class: 'box card' });
    this.el = h('div', { class: 'results' }, h('div', { class: 'scrim full' }), this.box);
  }
  onShow() {
    const r = this.g.lastResult;
    if (!r) return;
    const b = this.box;
    b.innerHTML = '';
    const isRank = r.event.rivals > 0;
    const placeTxt = r.finished ? (isRank ? `${r.position}º` : r.position <= 3 ? '★'.repeat(4 - r.position) : '—') : r.reason ?? t('failed');
    b.append(
      h('div', { class: 'eyebrow' }, `${t(r.event.type)} · ${t('results')}`),
      h('div', { style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' } },
        h('div', {}, h('div', { class: 'display', style: { fontSize: '30px' } }, L(r.event.name)), h('div', { class: 'place' }, placeTxt, isRank && r.finished ? h('small', {}, `/ ${r.event.rivals + 1}`) : null)),
        h('div', { style: { textAlign: 'right' } }, h('div', { class: 'stars' }, '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars)), h('div', { class: 'mono muted' }, r.score ? `${t('score')} ${r.score.toLocaleString('en-US')}` : formatTime(r.time))),
      ),
    );
    if (r.standings.length) {
      const tb = h('table');
      r.standings.forEach((s, i) => tb.append(h('tr', { class: s.isPlayer ? 'me' : '' }, h('td', { class: 'mono' }, String(i + 1)), h('td', {}, s.name), h('td', { class: 'muted' }, s.car), h('td', { class: 'mono', style: { textAlign: 'right' } }, formatTime(s.time)))));
      b.append(h('div', { class: 'scroll', style: { maxHeight: '28vh' } }, tb));
    }
    b.append(h('div', { class: 'rewards' }, h('div', { class: 'reward' }, h('div', { class: 'k' }, t('reward_cash')), h('div', { class: 'v' }, '+' + formatMoney(r.cash))), h('div', { class: 'reward' }, h('div', { class: 'k' }, t('reward_xp')), h('div', { class: 'v' }, `+${r.xp.toLocaleString('en-US')}`))));
    const retry = h('button', { class: 'btn ghost' }, t('retry'));
    retry.addEventListener('click', () => this.g.retryEvent());
    const cont = h('button', { class: 'btn' }, t('continue'));
    cont.addEventListener('click', () => this.g.quitEvent());
    b.append(h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'flex-end' } }, retry, cont));
  }
}
