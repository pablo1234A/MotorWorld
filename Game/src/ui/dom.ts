/** Minimal DOM builder used by the UI layer (no framework: fast startup on phones). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, any> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Inline SVG icons (stroke-based, 24x24). */
export const ICONS: Record<string, string> = {
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8"/></svg>',
  look: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
};

export function icon(name: string): HTMLElement {
  const s = document.createElement('span');
  s.style.display = 'contents';
  s.innerHTML = ICONS[name] ?? '';
  return s;
}

export function fillTriangle(dir: 'left' | 'right' | 'up' | 'down'): string {
  const p = { left: '16,4 6,12 16,20', right: '8,4 18,12 8,20', up: '4,16 12,6 20,16', down: '4,8 12,18 20,8' }[dir];
  return `<svg viewBox="0 0 24 24"><polygon points="${p}"/></svg>`;
}

/** Range input that paints its progress via a CSS variable. */
export function slider(min: number, max: number, step: number, value: number, onInput: (v: number) => void): HTMLInputElement {
  const r = h('input', { type: 'range', min, max, step, value });
  const paint = () => r.style.setProperty('--p', `${((+r.value - min) / (max - min)) * 100}%`);
  paint();
  r.addEventListener('input', () => {
    paint();
    onInput(+r.value);
  });
  return r;
}

export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}
