import { t } from '../core/i18n';
import { h } from './dom';

export interface Screen {
  el: HTMLElement;
  onShow?(): void;
  onHide?(): void;
  /** Called every frame while visible. */
  update?(dt: number): void;
  /** Back button / Escape. Return true if handled. */
  back?(): boolean;
}

/**
 * Screen stack + modals + global UI sound hooks.
 */
export class UI {
  readonly root: HTMLDivElement;
  private screens = new Map<string, Screen>();
  current: string | null = null;
  onSound?: (name: string) => void;

  constructor() {
    this.root = h('div', { id: 'ui' });
    document.body.append(this.root);
    // UI click sounds (delegated)
    this.root.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest('button, .opt, .lvl, .sw, .carcard, .row.click, .tab, .mitem');
      if (el) this.onSound?.('click');
    });
  }

  register(name: string, s: Screen) {
    s.el.classList.add('screen');
    this.screens.set(name, s);
    this.root.append(s.el);
  }

  get(name: string) {
    return this.screens.get(name);
  }

  show(name: string | null) {
    if (this.current === name) return;
    if (this.current) {
      const s = this.screens.get(this.current)!;
      s.el.classList.remove('on');
      s.onHide?.();
    }
    this.current = name;
    if (name) {
      const s = this.screens.get(name)!;
      s.onShow?.();
      // next frame so the CSS transition runs; skip if another screen was shown in the meantime
      requestAnimationFrame(() => {
        if (this.current === name) s.el.classList.add('on');
      });
    }
  }

  update(dt: number) {
    if (this.current) this.screens.get(this.current)?.update?.(dt);
  }

  back(): boolean {
    if (!this.current) return false;
    return this.screens.get(this.current)?.back?.() ?? false;
  }

  confirm(title: string, text: string, okLabel = t('yes'), cancelLabel = t('no')): Promise<boolean> {
    return new Promise((res) => {
      const close = (v: boolean) => {
        m.remove();
        res(v);
      };
      const ok = h('button', { class: 'btn' }, okLabel);
      const no = h('button', { class: 'btn ghost' }, cancelLabel);
      ok.addEventListener('click', () => close(true));
      no.addEventListener('click', () => close(false));
      const m = h('div', { class: 'modal' }, h('div', { class: 'box' }, h('h2', {}, title), h('p', { class: 'muted' }, text), h('div', { class: 'actions' }, no, ok)));
      this.root.append(m);
    });
  }

  alert(title: string, text: string) {
    return this.confirm(title, text, 'OK', t('back'));
  }
}

/** Shared header with back button. */
export function panelHead(title: string, eyebrow: string, onBack: () => void, right?: HTMLElement): HTMLElement {
  const back = h('button', { class: 'backbtn' }, t('back'));
  back.addEventListener('click', onBack);
  return h('div', { class: 'phead' }, h('div', {}, h('div', { class: 'eyebrow' }, eyebrow), h('h1', {}, title)), h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, right ?? null, back));
}
