export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));

export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarse = () => window.matchMedia('(hover: none), (pointer: coarse)').matches;
export const narrow = () => window.matchMedia('(max-width: 820px)').matches;

const eur = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const money = (n) => eur.format(n);
export const moneyShort = (n) => `€${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
export const num = (n) => new Intl.NumberFormat('en-GB').format(n);

export function html(strings, ...vals) {
  const t = document.createElement('template');
  t.innerHTML = strings.reduce((a, s, i) => a + s + (vals[i] ?? ''), '').trim();
  return t.content.firstElementChild;
}

/** rAF loop with delta time, returns a stop function. */
export function loop(fn) {
  let id, last = performance.now(), on = true;
  const tick = (now) => {
    if (!on) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    fn(dt, now / 1000);
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => { on = false; cancelAnimationFrame(id); };
}

export function img(slug, key, { sizes = '100vw', alt = '', eager = false, cls = '' } = {}) {
  const base = `assets/villas/${slug}/${key}`;
  return `<img class="${cls}" src="${base}-960.webp" srcset="${base}-960.webp 960w, ${base}.webp 1920w" sizes="${sizes}" alt="${alt}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="1920" height="1080">`;
}
