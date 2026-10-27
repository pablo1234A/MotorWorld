import { L, t } from '../../core/i18n';
import { formatMoney, formatTime } from '../../core/MathUtil';
import { EVENT_COLORS } from '../../game/Discovery';
import type { GameApi } from '../../game/GameApi';
import { EVENTS, type EventDef } from '../../race/EventCatalog';
import { CLASS_COLORS } from '../../vehicles/Performance';
import { clear, h } from '../dom';
import { panelHead, type Screen } from '../UI';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export class EventsScreen implements Screen {
  el: HTMLElement;
  private list: HTMLElement;
  private detail: HTMLElement;
  private sel: EventDef | null = null;
  returnTo: () => void = () => {};

  constructor(private g: GameApi) {
    this.list = h('div', { class: 'card scroll', style: { flex: '1.2', minWidth: '0' } });
    this.detail = h('div', { class: 'card scroll', style: { flex: '1', minWidth: '0', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' } });
    this.el = h('div', { class: 'panelscreen' }, h('div', { class: 'scrim full' }), panelHead(t('events'), 'MOTORWORLD', () => this.returnTo()), h('div', { class: 'pbody' }, this.list, this.detail));
  }

  back() {
    this.returnTo();
    return true;
  }

  onShow() {
    this.render();
  }

  private render() {
    const p = this.g.profile;
    clear(this.list);
    const sorted = [...EVENTS].sort((a, b) => a.minLevel - b.minLevel || a.difficulty - b.difficulty);
    for (const e of sorted) {
      const known = this.g.discovery.isKnown(e.id);
      const rec = p.data.events[e.id];
      const locked = p.level < e.minLevel;
      const row = h('div', { class: 'row click' + (this.sel === e ? ' sel' : ''), style: { cursor: 'pointer', opacity: known ? '1' : '0.5' } },
        h('div', { style: { width: '6px', alignSelf: 'stretch', background: hex(EVENT_COLORS[e.type]) } }),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, known ? L(e.name) : '???'), h('div', { class: 'sub' }, `${t(e.type)} · ${'◆'.repeat(e.difficulty)}${locked ? ` · ${t('locked_level')} ${e.minLevel}` : ''}`)),
        h('div', { class: 'stars', style: { fontSize: '14px' } }, rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : ''),
      );
      row.addEventListener('click', () => {
        this.sel = e;
        this.render();
      });
      this.list.append(row);
    }
    if (!this.sel) this.sel = sorted.find((e) => this.g.discovery.isKnown(e.id)) ?? sorted[0];
    this.renderDetail();
  }

  private renderDetail() {
    const e = this.sel!;
    const d = this.detail;
    clear(d);
    const known = this.g.discovery.isKnown(e.id);
    const p = this.g.profile;
    const rec = p.data.events[e.id];
    const locked = p.level < e.minLevel;
    d.append(h('div', { class: 'eyebrow', style: { color: hex(EVENT_COLORS[e.type]) } }, t(e.type)), h('div', { class: 'display', style: { fontSize: '34px' } }, known ? L(e.name) : t('undiscovered')));
    if (!known) {
      d.append(h('p', { class: 'muted' }, t('tutorial_2')));
      const gps = h('button', { class: 'btn ghost' }, t('set_route'));
      gps.addEventListener('click', () => {
        const s = this.g.discovery.starts.find((x) => x.def.id === e.id)!;
        this.g.setGps(s.x, s.z);
        this.returnTo();
      });
      d.append(gps);
      return;
    }
    d.append(h('p', { class: 'muted', style: { lineHeight: '1.5', fontSize: '14px' } }, L(e.desc)));
    const facts: [string, string][] = [
      [t('difficulty'), [t('easy'), t('normal'), t('hard'), t('pro')][e.difficulty - 1]],
      [t('requirements'), e.maxClass ? `${t('class_max')} ${e.maxClass}` : t('any_car')],
      [t('opponents'), e.rivals ? String(e.rivals) : '—'],
      [t('laps'), String(e.laps)],
      [t('rewards'), `${formatMoney(e.reward.cash)} · ${e.reward.xp} XP`],
    ];
    if (rec?.completed) facts.push([t('best'), rec.bestScore ? rec.bestScore.toLocaleString('en-US') : rec.bestTime ? formatTime(rec.bestTime) : `${rec.bestPos}º`]);
    const grid = h('div', { class: 'stats', style: { gridTemplateColumns: 'auto 1fr' } });
    for (const [k, v] of facts) grid.append(h('span', { class: 'k' }, k), h('span', { style: { fontWeight: '600' } }, v));
    d.append(grid);
    if (e.maxClass) d.append(h('div', { class: 'classbadge', style: { color: CLASS_COLORS[e.maxClass], alignSelf: 'flex-start' } }, h('span', { style: { background: CLASS_COLORS[e.maxClass] } }, e.maxClass), h('span', {}, t('class_max'))));
    const start = h('button', { class: 'btn' + (locked ? ' disabled' : '') }, locked ? `${t('locked_level')} ${e.minLevel}` : t('start_event'));
    start.addEventListener('click', () => !locked && this.g.startEvent(e.id));
    const gps = h('button', { class: 'btn ghost' }, t('set_route'));
    gps.addEventListener('click', () => {
      const s = this.g.discovery.starts.find((x) => x.def.id === e.id)!;
      this.g.setGps(s.x, s.z);
      this.returnTo();
    });
    d.append(h('div', { style: { display: 'flex', gap: '10px', marginTop: 'auto', flexWrap: 'wrap' } }, gps, start));
  }
}
