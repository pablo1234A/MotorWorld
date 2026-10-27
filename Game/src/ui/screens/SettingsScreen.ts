import { setLang, t } from '../../core/i18n';
import type { GameApi } from '../../game/GameApi';
import type { Settings } from '../../progression/Profile';
import { clear, h, slider } from '../dom';
import { panelHead, type Screen } from '../UI';

type Tab = 'graphics' | 'controls' | 'audio' | 'gameplay';

export class SettingsScreen implements Screen {
  el: HTMLElement;
  private body: HTMLElement;
  private tabs: HTMLElement;
  private tab: Tab = 'graphics';
  returnTo: () => void = () => {};

  constructor(private g: GameApi) {
    this.body = h('div', { class: 'card scroll', style: { flex: '1', maxWidth: '720px' } });
    this.tabs = h('div', { class: 'tabs' });
    this.el = h('div', { class: 'panelscreen' }, h('div', { class: 'scrim full' }), panelHead(t('settings'), 'MOTORWORLD', () => this.returnTo()), this.tabs, h('div', { class: 'pbody' }, this.body));
  }

  back() {
    this.returnTo();
    return true;
  }

  onShow() {
    this.render();
  }

  private set<K extends keyof Settings>(k: K, v: Settings[K], reload = false) {
    this.g.profile.settings[k] = v;
    this.g.profile.markDirty();
    this.g.applySettings(reload);
  }

  private options<K extends keyof Settings>(label: string, k: K, opts: [Settings[K], string][], reload = false): HTMLElement {
    const wrap = h('div', { class: 'opts' });
    for (const [v, lbl] of opts) {
      const b = h('button', { class: 'opt' + (this.g.profile.settings[k] === v ? ' on' : '') }, lbl);
      b.addEventListener('click', () => {
        this.set(k, v, reload);
        this.render();
      });
      wrap.append(b);
    }
    return h('div', { class: 'field' }, h('label', {}, label), wrap);
  }

  private range<K extends keyof Settings>(label: string, k: K, min: number, max: number, step: number, fmt: (v: number) => string): HTMLElement {
    const val = h('span', {}, fmt(this.g.profile.settings[k] as number));
    const r = slider(min, max, step, this.g.profile.settings[k] as number, (v) => {
      val.textContent = fmt(v);
      this.set(k, v as Settings[K]);
    });
    return h('div', { class: 'field' }, h('label', {}, label, val), r);
  }

  private toggle<K extends keyof Settings>(label: string, k: K): HTMLElement {
    return this.options(label, k, [[true as Settings[K], t('on')], [false as Settings[K], t('off')]]);
  }

  private render() {
    clear(this.tabs);
    for (const tb of ['graphics', 'controls', 'audio', 'gameplay'] as Tab[]) {
      const b = h('button', { class: 'tab' + (this.tab === tb ? ' on' : '') }, t(tb));
      b.addEventListener('click', () => {
        this.tab = tb;
        this.render();
      });
      this.tabs.append(b);
    }
    const b = this.body;
    clear(b);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    if (this.tab === 'graphics') {
      b.append(
        this.options(t('quality'), 'quality', [['auto', t('auto')], ['low', t('low')], ['medium', t('medium')], ['high', t('high')], ['ultra', t('ultra')]]),
        this.range(t('resolution'), 'resolution', 0.5, 1, 0.05, pct),
        this.options(t('fps_target'), 'fps', [[30, '30'], [60, '60']]),
        this.toggle(t('show_fps'), 'showFps'),
        this.range(t('hud_scale'), 'hudScale', 0.75, 1.25, 0.05, pct),
      );
    } else if (this.tab === 'controls') {
      b.append(
        this.options(t('control_mode'), 'controls', [['buttons', t('ctl_buttons')], ['slider', t('ctl_slider')], ['tilt', t('ctl_tilt')]]),
        this.range(t('sensitivity'), 'sensitivity', 0.1, 1, 0.05, pct),
        this.options(t('transmission'), 'autoGear', [[true, t('automatic')], [false, t('manual')]]),
        this.toggle(t('abs'), 'abs'),
        this.toggle(t('tcs'), 'tcs'),
        this.toggle(t('stability'), 'stability'),
        this.toggle(t('steer_assist'), 'steerAssist'),
        this.toggle(t('vibration'), 'vibration'),
      );
    } else if (this.tab === 'audio') {
      b.append(this.range(t('vol_master'), 'volMaster', 0, 1, 0.05, pct), this.range(t('vol_engine'), 'volEngine', 0, 1, 0.05, pct), this.range(t('vol_sfx'), 'volSfx', 0, 1, 0.05, pct), this.range(t('vol_music'), 'volMusic', 0, 1, 0.05, pct));
    } else {
      const lang = this.options(t('language'), 'lang', [['es', 'Español'], ['en', 'English']]);
      lang.addEventListener('click', () => setLang(this.g.profile.settings.lang));
      b.append(lang, this.options(t('units'), 'units', [['kmh', 'km/h'], ['mph', 'mph']]), this.range(t('traffic'), 'traffic', 0, 1.5, 0.1, pct));
      // weather & time controls for free roam
      const w = h('div', { class: 'opts' });
      for (const k of ['clear', 'cloudy', 'rain', 'storm']) {
        const bt = h('button', { class: 'opt' + (this.g.env.weather === k ? ' on' : '') }, t(k));
        bt.addEventListener('click', () => {
          this.g.setWeather(k);
          this.render();
        });
        w.append(bt);
      }
      b.append(h('div', { class: 'field' }, h('label', {}, t('weather')), w));
      const tv = h('span', {}, this.g.env.clock);
      b.append(h('div', { class: 'field' }, h('label', {}, t('time_of_day'), tv), slider(0, 24, 0.25, this.g.env.time, (v) => {
        this.g.setTime(v);
        tv.textContent = this.g.env.clock;
      })));
      const reset = h('button', { class: 'btn ghost small' }, t('reset_progress'));
      reset.addEventListener('click', async () => {
        if (await this.g.ui.confirm(t('reset_progress'), t('reset_confirm'))) {
          this.g.profile.wipe();
          location.reload();
        }
      });
      b.append(h('div', { class: 'field' }, reset));
    }
  }
}
