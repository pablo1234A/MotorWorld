import { L, t } from '../../core/i18n';
import { formatMoney } from '../../core/MathUtil';
import type { GameApi } from '../../game/GameApi';
import type { OwnedCar } from '../../progression/Profile';
import { CARS, getCar, type CarDef } from '../../vehicles/CarCatalog';
import { CLASS_COLORS, computeStats, type PerfStats } from '../../vehicles/Performance';
import {
  carCostFactor, DEFAULT_TUNE, defaultVisual, partAvailable, partPrice, PARTS, resolveSpec, RIM_NAMES, TUNE_SLIDERS, VINYLS, VISUAL_PRICES, type Finish, type PartGroup, type VisualConfig,
} from '../../vehicles/Tuning';
import { clear, h, slider } from '../dom';
import { panelHead, type Screen } from '../UI';

const PALETTE = [0xe01a2b, 0xc8102e, 0xff6a13, 0xf2b631, 0xf4e04d, 0x7ed957, 0x1e8449, 0x0f5c48, 0x2ec4b6, 0x2f6feb, 0x1d2a6b, 0x6c3fc5, 0xd946ef, 0xf4f4f4, 0xb8bcc0, 0x6b7177, 0x2a2d31, 0x0b0b0d, 0x8a5a2b, 0xd8c3a5];
const RIM_COLORS = [0x9aa0a6, 0xe8e8e8, 0x1b1b1d, 0x3a3d42, 0xc9a227, 0xb87333, 0xe01a2b, 0x2f6feb, 0xf4f4f4];
const CALIPERS = [0x8a8a8a, 0xe01a2b, 0xd6a400, 0x2f6feb, 0x22c55e, 0x111111];
const GLOW = [0, 0x00aaff, 0xff2040, 0x9b30ff, 0x22ff88, 0xffffff];
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function classBadge(s: PerfStats): HTMLElement {
  return h('div', { class: 'classbadge', style: { color: CLASS_COLORS[s.cls] } }, h('span', { style: { background: CLASS_COLORS[s.cls] } }, s.cls), h('span', {}, String(s.pi)));
}

/** Stat bars comparing current vs preview. */
function statsBlock(base: PerfStats, cur: PerfStats, units: 'kmh' | 'mph'): HTMLElement {
  const g = h('div', { class: 'stats' });
  const sp = (v: number) => (units === 'mph' ? `${Math.round(v / 1.609)} mph` : `${Math.round(v)} km/h`);
  const rows: [string, number, number, string][] = [
    [t('speed'), base.bars.speed, cur.bars.speed, sp(cur.topSpeed)],
    [t('accel'), base.bars.accel, cur.bars.accel, `${cur.zeroTo100.toFixed(2)} s`],
    [t('handling'), base.bars.handling, cur.bars.handling, `${cur.lateralG.toFixed(2)} g`],
    [t('braking'), base.bars.braking, cur.bars.braking, `${cur.braking.toFixed(1)} m`],
    [t('launch'), base.bars.launch, cur.bars.launch, ''],
    [t('offroad'), base.bars.offroad, cur.bars.offroad, ''],
  ];
  for (const [k, b, c, v] of rows) {
    const lo = Math.min(b, c), hi = Math.max(b, c);
    const bar = h('div', { class: 'bar' }, h('i', { class: 'base', style: { width: `${lo * 10}%` } }), h('i', { class: c >= b ? 'delta-up' : 'delta-down', style: { width: `${hi * 10}%` } }));
    g.append(h('span', { class: 'k' }, k), bar, h('span', { class: 'v' }, v));
  }
  const facts = h('div', { style: { display: 'flex', gap: '14px', flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--muted)', marginTop: '6px' } },
    h('span', {}, `${Math.round(cur.hp)} CV`), h('span', {}, `${Math.round(cur.torque)} Nm`), h('span', {}, `${Math.round(cur.weight)} kg`), h('span', {}, cur.layout));
  return h('div', {}, g, facts);
}

// =====================================================================================
export class DealerScreen implements Screen {
  el: HTMLElement;
  private list: HTMLElement;
  private info: HTMLElement;
  private sel: CarDef;
  private tab: 'owned' | 'dealer' = 'owned';
  private tabs: HTMLElement;
  returnTo: () => void = () => {};

  constructor(private g: GameApi) {
    this.sel = CARS[0];
    this.list = h('div', { class: 'carlist' });
    this.info = h('div', { class: 'card scroll', style: { width: 'min(360px, 42vw)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', marginLeft: 'auto' } });
    this.tabs = h('div', { class: 'tabs' });
    const stage = h('div', { style: { flex: '1', minHeight: '0', display: 'flex' } }, this.info);
    this.el = h('div', { class: 'panelscreen scr-dealer' }, panelHead(t('cars'), t('dealership'), () => this.returnTo(), this.tabs), stage, this.list);
    g.garage.bindInput(this.el);
  }

  back() {
    this.returnTo();
    return true;
  }

  onShow() {
    this.g.garage.offsetX = -1;
    this.sel = getCar(this.g.profile.currentCar.carId);
    this.render();
  }

  private render() {
    clear(this.tabs);
    for (const k of ['owned', 'dealer'] as const) {
      const b = h('button', { class: 'tab' + (this.tab === k ? ' on' : '') }, k === 'owned' ? t('collection') : t('dealership'));
      b.addEventListener('click', () => {
        this.tab = k;
        this.render();
      });
      this.tabs.append(b);
    }
    const p = this.g.profile;
    clear(this.list);
    const cars = this.tab === 'owned' ? p.data.cars.map((c) => getCar(c.carId)) : [...CARS].sort((a, b) => a.price - b.price);
    const seen = new Set<string>();
    for (const def of cars) {
      if (this.tab === 'owned' && seen.has(def.id)) continue;
      seen.add(def.id);
      const owned = p.ownsCar(def.id);
      const locked = p.level < def.unlockLevel && !owned;
      const card = h('button', { class: 'carcard card' + (def === this.sel ? ' sel' : '') },
        h('div', { class: 'cardstripe', style: { background: hex(def.color) } }),
        h('div', { class: 'brand' }, def.brand),
        h('div', { class: 'model' }, def.model),
        h('div', { class: 'meta' }, h('span', {}, `${def.year} · ${def.spec.drivetrain.layout}`), h('span', { class: 'price' + (!owned && !p.canAfford(def.price) ? ' no' : '') }, owned ? t('owned') : formatMoney(def.price))),
        locked ? h('div', { class: 'lock' }, `${t('locked_level')} ${def.unlockLevel}`) : null,
      );
      card.addEventListener('click', () => {
        this.sel = def;
        this.render();
      });
      this.list.append(card);
    }
    this.renderInfo();
  }

  private renderInfo() {
    const def = this.sel;
    const p = this.g.profile;
    const owned = p.data.cars.find((c) => c.carId === def.id);
    const visual = owned ? owned.visual : defaultVisual(def);
    this.g.garage.setCar(def, visual, owned?.parts ?? {});
    const i = this.info;
    clear(i);
    const stock = computeStats(resolveSpec(def, {}));
    const cur = owned ? computeStats(resolveSpec(def, owned.parts, owned.tune)) : stock;
    i.append(
      h('div', { class: 'eyebrow' }, `${def.brand} · ${def.year}`),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' } }, h('div', { class: 'display', style: { fontSize: '30px' } }, def.model), classBadge(cur)),
      h('div', { class: 'mono muted', style: { fontSize: '11px', letterSpacing: '.08em' } }, `${def.engineLabel.toUpperCase()} · ${def.spec.drivetrain.layout}`),
      h('p', { class: 'muted', style: { fontSize: '13px', lineHeight: '1.45' } }, L(def.desc)),
      statsBlock(stock, cur, p.settings.units),
    );
    const actions = h('div', { style: { display: 'flex', gap: '8px', marginTop: 'auto', flexWrap: 'wrap' } });
    if (owned) {
      const isCur = p.currentCar.carId === def.id;
      const sel = h('button', { class: 'btn' + (isCur ? ' disabled' : '') }, isCur ? t('selected') : t('select'));
      sel.addEventListener('click', () => {
        this.g.setPlayerCar(owned.uid);
        this.render();
      });
      const tune = h('button', { class: 'btn ghost' }, t('garage'));
      tune.addEventListener('click', () => {
        this.g.setPlayerCar(owned.uid);
        this.g.open('garage');
      });
      actions.append(tune, sel);
      if (p.data.cars.length > 1) {
        const sell = h('button', { class: 'btn ghost small' }, `${t('sell')} ${formatMoney(def.price * 0.6)}`);
        sell.addEventListener('click', async () => {
          if (await this.g.ui.confirm(t('sell'), `${def.brand} ${def.model} → ${formatMoney(def.price * 0.6)}`)) {
            p.sellCar(owned.uid);
            this.g.refreshPlayerCar();
            this.render();
          }
        });
        actions.append(sell);
      }
    } else {
      const locked = p.level < def.unlockLevel;
      const afford = p.canAfford(def.price);
      const buy = h('button', { class: 'btn' + (locked || !afford ? ' disabled' : '') }, locked ? `${t('locked_level')} ${def.unlockLevel}` : !afford ? t('not_enough') : `${t('buy')} · ${formatMoney(def.price)}`);
      buy.addEventListener('click', async () => {
        if (!(await this.g.ui.confirm(t('buy'), `${t('confirm_buy')} ${formatMoney(def.price)}?`))) return;
        const car = p.buyCar(def.id);
        if (car) {
          this.g.sound('buy');
          this.g.setPlayerCar(car.uid);
          this.tab = 'owned';
          this.render();
        } else this.g.sound('error');
      });
      actions.append(buy);
    }
    i.append(actions);
  }
}

// =====================================================================================
type GTab = 'performance' | 'tuning' | 'appearance';

export class GarageScreen implements Screen {
  el: HTMLElement;
  private panel: HTMLElement;
  private tabs: HTMLElement;
  private statsEl: HTMLElement;
  private tab: GTab = 'performance';
  private group: PartGroup = 'engine';
  private vtab = 'paint';
  private stock: PerfStats | null = null;
  private statsTimer: ReturnType<typeof setTimeout> | null = null;
  private cashEl: HTMLElement;
  returnTo: () => void = () => {};

  constructor(private g: GameApi) {
    this.panel = h('div', { class: 'card scroll', style: { width: 'min(420px, 46vw)', marginLeft: 'auto', display: 'flex', flexDirection: 'column' } });
    this.tabs = h('div', { class: 'tabs' });
    this.statsEl = h('div', { class: 'card', style: { width: 'min(330px, 34vw)', padding: '14px', alignSelf: 'flex-end', display: 'flex', flexDirection: 'column', gap: '8px' } });
    this.cashEl = h('div', { class: 'chip' });
    const testBtn = h('button', { class: 'btn ghost small' }, t('test_drive'));
    testBtn.addEventListener('click', () => this.g.testDrive());
    this.el = h('div', { class: 'panelscreen scr-garage' },
      panelHead(t('garage'), 'MOTORWORLD TUNING', () => this.returnTo(), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, this.cashEl, testBtn)),
      this.tabs,
      h('div', { class: 'pbody' }, this.statsEl, this.panel),
    );
    g.garage.bindInput(this.el);
  }

  back() {
    this.returnTo();
    return true;
  }

  private get car(): OwnedCar {
    return this.g.profile.currentCar;
  }
  private get def(): CarDef {
    return getCar(this.car.carId);
  }

  onShow() {
    this.g.garage.offsetX = 0.2;
    this.stock = computeStats(resolveSpec(this.def, {}));
    this.refresh();
  }

  onHide() {
    this.g.refreshPlayerCar();
  }

  private refresh() {
    this.g.garage.setCar(this.def, this.car.visual, this.car.parts);
    this.cashEl.innerHTML = `<b>${formatMoney(this.g.profile.data.cash)}</b>`;
    this.renderTabs();
    this.renderPanel();
    this.scheduleStats();
  }

  private scheduleStats() {
    if (this.statsTimer) clearTimeout(this.statsTimer);
    this.statsTimer = setTimeout(() => {
      const cur = computeStats(resolveSpec(this.def, this.car.parts, this.car.tune));
      clear(this.statsEl);
      this.statsEl.append(
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('div', {}, h('div', { class: 'eyebrow' }, this.def.brand), h('div', { class: 'display', style: { fontSize: '24px' } }, this.def.model)), classBadge(cur)),
        statsBlock(this.stock!, cur, this.g.profile.settings.units),
      );
    }, 30);
  }

  private renderTabs() {
    clear(this.tabs);
    for (const k of ['performance', 'tuning', 'appearance'] as GTab[]) {
      const b = h('button', { class: 'tab' + (this.tab === k ? ' on' : '') }, t(k));
      b.addEventListener('click', () => {
        this.tab = k;
        this.refresh();
      });
      this.tabs.append(b);
    }
  }

  private renderPanel() {
    const p = this.panel;
    clear(p);
    if (this.tab === 'performance') this.renderPerformance(p);
    else if (this.tab === 'tuning') this.renderTuning(p);
    else this.renderAppearance(p);
  }

  private renderPerformance(p: HTMLElement) {
    const groups: PartGroup[] = ['engine', 'drivetrain', 'chassis', 'brakes', 'tires', 'aero', 'nitro'];
    const gt = h('div', { class: 'tabs', style: { padding: '6px 8px', borderBottom: '1px solid var(--line)' } });
    for (const gr of groups) {
      const b = h('button', { class: 'tab' + (this.group === gr ? ' on' : ''), style: { fontSize: '12px', padding: '7px 9px' } }, t('grp_' + gr));
      b.addEventListener('click', () => {
        this.group = gr;
        this.renderPanel();
      });
      gt.append(b);
    }
    p.append(gt);
    const prof = this.g.profile;
    const car = this.car;
    for (const part of PARTS.filter((x) => x.group === this.group)) {
      if (!partAvailable(this.def, part.slot)) continue;
      const cur = car.parts[part.slot] ?? 0;
      const lv = h('div', { class: 'levels' });
      part.levels.forEach((_name, level) => {
        const owned = prof.partOwned(car, part.slot, level);
        const price = partPrice(this.def, part.slot, level);
        const b = h('button', { class: 'lvl' + (cur === level ? ' on' : owned ? ' owned' : ''), title: L(part.levels[level]) }, level === 0 ? 'S' : String(level));
        b.addEventListener('click', async () => {
          if (cur === level) return;
          if (!owned) {
            if (!prof.canAfford(price)) {
              this.g.sound('error');
              return;
            }
            if (!(await this.g.ui.confirm(`${L(part.name)} · ${L(part.levels[level])}`, `${t('buy')} ${formatMoney(price)}?`))) return;
            this.g.sound('buy');
          }
          prof.installPart(car, part.slot, level);
          this.refresh();
        });
        lv.append(b);
      });
      const name = L(part.levels[cur]);
      const next = part.levels.findIndex((_, l) => l > cur);
      const sub = next > 0 && !prof.partOwned(car, part.slot, next) ? `${L(part.levels[next])}: ${formatMoney(partPrice(this.def, part.slot, next))}` : name;
      p.append(h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, L(part.name)), h('div', { class: 'sub' }, sub)), lv));
    }
    p.append(h('div', { class: 'mono muted', style: { padding: '10px 14px', fontSize: '11px' } }, `${t('price')} ×${carCostFactor(this.def).toFixed(2)}`));
  }

  private renderTuning(p: HTMLElement) {
    const car = this.car;
    const spec = resolveSpec(this.def, car.parts, car.tune);
    for (const s of TUNE_SLIDERS) {
      if (s.awdOnly && spec.drivetrain.layout !== 'AWD') continue;
      const [slot, need] = s.requires;
      const ok = (car.parts[slot] ?? 0) >= need;
      const val = h('span', {}, s.fmt(car.tune[s.key]));
      const field = h('div', { class: 'field', style: { opacity: ok ? '1' : '0.4' } }, h('label', {}, L(s.label), val));
      if (ok) {
        field.append(slider(s.min, s.max, s.step, car.tune[s.key], (v) => {
          car.tune[s.key] = v;
          val.textContent = s.fmt(v);
          this.g.profile.markDirty();
          this.g.garage.setCar(this.def, car.visual, car.parts);
          this.scheduleStats();
        }));
      } else field.append(h('div', { class: 'muted', style: { fontSize: '12px' } }, `${t('requires_race')}: ${L(PARTS.find((x) => x.slot === slot)!.name)}`));
      p.append(field);
    }
    const reset = h('button', { class: 'btn ghost small', style: { margin: '12px 14px' } }, t('restore'));
    reset.addEventListener('click', () => {
      car.tune = { ...DEFAULT_TUNE };
      this.g.profile.markDirty();
      this.refresh();
    });
    p.append(reset);
  }

  private visualBuy(price: number, apply: () => void) {
    if (!this.g.profile.spend(price)) {
      this.g.sound('error');
      return;
    }
    apply();
    this.g.profile.markDirty();
    this.refresh();
  }

  private renderAppearance(p: HTMLElement) {
    const vt = h('div', { class: 'tabs', style: { padding: '6px 8px', borderBottom: '1px solid var(--line)' } });
    for (const k of ['paint', 'vinyl', 'rims', 'body', 'extras']) {
      const b = h('button', { class: 'tab' + (this.vtab === k ? ' on' : ''), style: { fontSize: '12px', padding: '7px 9px' } }, k === 'body' ? t('front_bumper').split(' ')[0] : k === 'extras' ? '+' : t(k));
      b.addEventListener('click', () => {
        this.vtab = k;
        this.renderPanel();
      });
      vt.append(b);
    }
    p.append(vt);
    const v: VisualConfig = this.car.visual;
    const swatches = (label: string, colors: number[], cur: number, price: number, set: (c: number) => void) => {
      const w = h('div', { class: 'swatches' });
      for (const c of colors) {
        const b = h('button', { class: 'sw' + (c === cur ? ' on' : ''), style: { background: c === 0 ? 'repeating-linear-gradient(45deg,#222 0 4px,#333 4px 8px)' : hex(c) }, 'aria-label': hex(c) });
        b.addEventListener('click', () => c !== cur && this.visualBuy(price, () => set(c)));
        w.append(b);
      }
      const custom = h('input', { type: 'color', value: hex(cur || 0xffffff) }) as HTMLInputElement;
      custom.addEventListener('change', () => this.visualBuy(price, () => set(parseInt(custom.value.slice(1), 16))));
      w.append(custom);
      return h('div', { class: 'field' }, h('label', {}, label, h('span', {}, formatMoney(price))), w);
    };
    const options = (label: string, names: string[], cur: number, price: number, set: (i: number) => void) => {
      const w = h('div', { class: 'opts' });
      names.forEach((n, i) => {
        const b = h('button', { class: 'opt' + (i === cur ? ' on' : '') }, n);
        b.addEventListener('click', () => i !== cur && this.visualBuy(price, () => set(i)));
        w.append(b);
      });
      return h('div', { class: 'field' }, h('label', {}, label, h('span', {}, formatMoney(price))), w);
    };
    switch (this.vtab) {
      case 'paint': {
        p.append(swatches(t('paint'), PALETTE, v.color, VISUAL_PRICES.paint, (c) => (v.color = c)));
        const fins: Finish[] = ['gloss', 'metallic', 'pearl', 'satin', 'matte', 'chrome'];
        p.append(options(t('finish'), fins.map((f) => t('finish_' + f)), fins.indexOf(v.finish), VISUAL_PRICES.finish, (i) => (v.finish = fins[i])));
        break;
      }
      case 'vinyl':
        p.append(options(t('vinyl'), VINYLS.map((x) => L(x)), v.vinyl, VISUAL_PRICES.vinyl, (i) => (v.vinyl = i)));
        p.append(swatches(t('vinyl_color'), PALETTE, v.vinylColor, 200, (c) => (v.vinylColor = c)));
        p.append(swatches(t('vinyl_color2'), PALETTE, v.vinylColor2, 200, (c) => (v.vinylColor2 = c)));
        {
          const val = h('span', {}, String(v.raceNumber));
          p.append(h('div', { class: 'field' }, h('label', {}, '#', val), slider(1, 99, 1, v.raceNumber, (n) => {
            v.raceNumber = n;
            val.textContent = String(n);
            this.g.profile.markDirty();
            this.g.garage.setCar(this.def, v, this.car.parts);
          })));
        }
        break;
      case 'rims':
        p.append(options(t('rims'), RIM_NAMES, v.rimStyle, VISUAL_PRICES.rims, (i) => (v.rimStyle = i)));
        p.append(swatches(t('rim_color'), RIM_COLORS, v.rimColor, VISUAL_PRICES.rimColor, (c) => (v.rimColor = c)));
        p.append(options(t('rim_size'), ['+0"', '+1"', '+2"'], v.rimSize, VISUAL_PRICES.rims * 0.5, (i) => (v.rimSize = i)));
        p.append(swatches(t('caliper'), CALIPERS, v.caliperColor, VISUAL_PRICES.caliper, (c) => (v.caliperColor = c)));
        break;
      case 'body':
        p.append(options(t('front_bumper'), [t('stock'), t('sport'), t('race')], v.frontBumper, VISUAL_PRICES.frontBumper, (i) => (v.frontBumper = i)));
        p.append(options(t('rear_bumper'), [t('stock'), t('sport'), t('race')], v.rearBumper, VISUAL_PRICES.rearBumper, (i) => (v.rearBumper = i)));
        p.append(options(t('skirts'), [t('stock'), t('carbon')], v.skirts, VISUAL_PRICES.skirts, (i) => (v.skirts = i)));
        p.append(options(t('hood'), [t('stock'), t('vented'), t('carbon')], v.hood, VISUAL_PRICES.hood, (i) => (v.hood = i)));
        break;
      default:
        p.append(options(t('tint'), ['20%', '50%', '80%'], v.tint, VISUAL_PRICES.tint, (i) => (v.tint = i)));
        p.append(options(t('lights'), [t('stock'), 'Smoke', 'Xenon'], v.lights, VISUAL_PRICES.lights, (i) => (v.lights = i)));
        p.append(swatches(t('underglow'), GLOW, v.underglow, VISUAL_PRICES.underglow, (c) => (v.underglow = c)));
    }
  }
}
