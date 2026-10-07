import { VILLAS, LOCATIONS, TYPES } from '../data/villas.js';
import { icon } from './icons.js';
import { img, money, moneyShort, num, reduced } from './utils.js';

/**
 * The collection: live search + filters over the data set, with FLIP-animated
 * reflow so tiles glide to their new places instead of snapping.
 */

const PRICE_MIN = 4e6, PRICE_MAX = 34e6, AREA_MIN = 300, AREA_MAX = 1200;
const SORTS = {
  featured: { label: 'Featured', fn: () => 0 },
  priceAsc: { label: 'Price, low to high', fn: (a, b) => a.price - b.price },
  priceDesc: { label: 'Price, high to low', fn: (a, b) => b.price - a.price },
  area: { label: 'Largest first', fn: (a, b) => b.area - a.area },
};

const SIZES = ['(min-width: 900px) 58vw', '(min-width: 900px) 40vw', '(min-width: 900px) 33vw', '(min-width: 900px) 64vw', '(min-width: 900px) 48vw', '(min-width: 900px) 48vw'];

export function mountCatalog(host) {
  const state = { q: '', country: 'All', type: 'All', maxPrice: PRICE_MAX, beds: 0, minArea: AREA_MIN, sort: 'featured' };

  host.innerHTML = `
    <div class="cat__head wrap">
      <h2 class="display cat__title" data-reveal="words">The collection</h2>
      <p class="cat__lede" data-reveal>Eight residences, each held for a single private owner. Filter by what matters — the list updates as you do.</p>
    </div>
    <form class="filters wrap" role="search" aria-label="Filter residences" autocomplete="off">
      <div class="filters__top">
        <label class="search">
          ${icon.search}
          <span class="sr">Search residences</span>
          <input type="search" name="q" placeholder="Search by name or place" spellcheck="false">
        </label>
        <button type="button" class="filters__toggle btn btn--ghost" aria-expanded="false" aria-controls="filters-body">Filters <span class="filters__count" hidden></span></button>
        <label class="sort">
          <span class="sr">Sort residences</span>
          <select name="sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
        </label>
      </div>
      <div class="filters__body" id="filters-body">
        <fieldset class="f f--chips f--loc"><legend>Location</legend>
          <div class="chips" data-group="country">${['All', ...LOCATIONS].map((v, i) => `<button type="button" class="chip" data-value="${v}" aria-pressed="${i === 0}">${v}</button>`).join('')}</div>
        </fieldset>
        <fieldset class="f f--chips f--type"><legend>Property type</legend>
          <div class="chips" data-group="type">${['All', ...TYPES].map((v, i) => `<button type="button" class="chip" data-value="${v}" aria-pressed="${i === 0}">${v}</button>`).join('')}</div>
        </fieldset>
        <fieldset class="f f--chips f--beds"><legend>Bedrooms</legend>
          <div class="chips" data-group="beds">${[['Any', 0], ['4+', 4], ['5+', 5], ['6+', 6], ['7+', 7]].map(([l, v], i) => `<button type="button" class="chip" data-value="${v}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>
        </fieldset>
        <div class="f f--range f--price">
          <label for="f-price">Price <output id="o-price" class="tnum">up to ${moneyShort(PRICE_MAX)}</output></label>
          <input id="f-price" type="range" name="maxPrice" min="${PRICE_MIN}" max="${PRICE_MAX}" step="500000" value="${PRICE_MAX}">
        </div>
        <div class="f f--range f--area">
          <label for="f-area">Surface <output id="o-area" class="tnum">from ${AREA_MIN} m²</output></label>
          <input id="f-area" type="range" name="minArea" min="${AREA_MIN}" max="${AREA_MAX}" step="20" value="${AREA_MIN}">
        </div>
        <button type="button" class="reset link" hidden>Reset filters</button>
      </div>
      <p class="results tnum" aria-live="polite"></p>
    </form>
    <ul class="grid wrap" role="list"></ul>
    <div class="empty wrap" hidden>
      <p class="display">Nothing matches — yet.</p>
      <p class="body">Widen the price, lower the surface, or let us know what you are looking for. Many of our residences are never listed publicly.</p>
      <button type="button" class="btn btn--paper reset-all">Reset filters <span class="btn__dot">${icon.arrow}</span></button>
    </div>`;

  const form = host.querySelector('form');
  const grid = host.querySelector('.grid');
  const empty = host.querySelector('.empty');
  const results = host.querySelector('.results');
  const resetLink = host.querySelector('.reset');
  const countBadge = host.querySelector('.filters__count');

  /* ------------------------------------------------------------ tiles */
  const tiles = VILLAS.map((v, i) => {
    const li = document.createElement('li');
    li.className = 'tile';
    li.innerHTML = `
      <a class="tile__link" href="#/villa/${v.slug}" data-cursor="View" aria-label="${v.name}, ${v.place} — ${money(v.price)}">
        <div class="tile__media" data-depth><div class="tile__img" data-depth-inner>${img(v.slug, v.heroShot ? 'hero' : 'hero', { sizes: SIZES[i % 6], alt: `${v.name}, a ${v.type.toLowerCase()} residence in ${v.place}` })}</div><span class="tile__tag">${v.tag}</span></div>
        <div class="tile__text">
          <div class="tile__row">
            <h3 class="tile__name display">${v.name}</h3>
            <p class="tile__price tnum">${money(v.price)}</p>
          </div>
          <p class="tile__place">${icon.pin}<span>${v.place}, ${v.country}</span><span class="tile__type">${v.type}</span></p>
          <p class="tile__blurb">${v.blurb}</p>
          <ul class="tile__meta tnum" aria-label="Key figures">
            <li>${icon.area}<span>${num(v.area)} m²</span></li>
            <li>${icon.bed}<span>${v.beds} bedrooms</span></li>
            <li>${icon.bath}<span>${v.baths} bathrooms</span></li>
          </ul>
          <span class="tile__cta link">View residence ${icon.arrow}</span>
        </div>
      </a>`;
    grid.append(li);
    return { v, el: li, shown: true };
  });

  /* ---------------------------------------------------------- filtering */
  const matches = (v) => {
    const q = state.q.trim().toLowerCase();
    if (q && !`${v.name} ${v.place} ${v.region} ${v.country} ${v.type}`.toLowerCase().includes(q)) return false;
    if (state.country !== 'All' && v.country !== state.country) return false;
    if (state.type !== 'All' && v.type !== state.type) return false;
    if (v.price > state.maxPrice) return false;
    if (v.beds < state.beds) return false;
    if (v.area < state.minArea) return false;
    return true;
  };

  const dirty = () => state.q || state.country !== 'All' || state.type !== 'All' || state.maxPrice < PRICE_MAX || state.beds > 0 || state.minArea > AREA_MIN;

  let token = 0;
  async function apply({ animate = true } = {}) {
    const my = ++token;
    const visible = tiles.filter((t) => matches(t.v)).sort((a, b) => SORTS[state.sort].fn(a.v, b.v));
    const showSet = new Set(visible);
    const fast = !animate || reduced();

    // status text
    results.textContent = `${visible.length} ${visible.length === 1 ? 'residence' : 'residences'}`;
    resetLink.hidden = !dirty();
    const active = [state.q, state.country !== 'All', state.type !== 'All', state.maxPrice < PRICE_MAX, state.beds > 0, state.minArea > AREA_MIN].filter(Boolean).length;
    countBadge.hidden = !active; countBadge.textContent = active;

    const leaving = tiles.filter((t) => t.shown && !showSet.has(t));
    const entering = visible.filter((t) => !t.shown);
    const staying = visible.filter((t) => t.shown);

    // 1 — fade out whatever leaves
    if (!fast && leaving.length) {
      await Promise.race([
        Promise.all(leaving.map((t) => t.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 260, easing: 'cubic-bezier(0.65,0,0.35,1)', fill: 'forwards' }).finished.catch(() => {}))),
        new Promise((r) => setTimeout(r, 340)), // never let a slow frame rate stall the filter
      ]);
      if (my !== token) return;
    }

    // 2 — measure, mutate, play
    const first = new Map(staying.map((t) => [t, t.el.getBoundingClientRect()]));
    leaving.forEach((t) => { t.el.hidden = true; t.shown = false; t.el.getAnimations().forEach((a) => a.cancel()); });
    entering.forEach((t) => { t.el.hidden = false; t.shown = true; });
    visible.forEach((t, i) => { grid.append(t.el); t.el.dataset.slot = String(i % 6); });
    empty.hidden = visible.length > 0;

    if (fast) return;
    staying.forEach((t) => {
      const a = first.get(t), b = t.el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) + Math.abs(dy) < 2) return;
      t.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 900, easing: 'cubic-bezier(0.16,1,0.3,1)' });
    });
    entering.forEach((t, i) => t.el.animate([{ opacity: 0, transform: 'translateY(40px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 1000, delay: 120 + i * 90, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'backwards' }));
  }

  /* ------------------------------------------------------------ inputs */
  const search = form.querySelector('input[name="q"]');
  let st;
  search.addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => { state.q = search.value; apply(); }, 140); });
  form.addEventListener('submit', (e) => e.preventDefault());
  form.querySelector('select[name="sort"]').addEventListener('change', (e) => { state.sort = e.target.value; apply(); });

  form.querySelectorAll('.chips').forEach((g) => {
    g.addEventListener('click', (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      g.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      const key = g.dataset.group, val = b.dataset.value;
      state[key] = key === 'beds' ? +val : val;
      apply();
    });
  });

  const priceIn = form.querySelector('[name="maxPrice"]'), areaIn = form.querySelector('[name="minArea"]');
  const paint = (el) => { const pct = ((el.value - el.min) / (el.max - el.min)) * 100; el.style.setProperty('--fill', `${pct}%`); };
  [priceIn, areaIn].forEach(paint);
  let rt;
  priceIn.addEventListener('input', () => {
    state.maxPrice = +priceIn.value; paint(priceIn);
    host.querySelector('#o-price').textContent = state.maxPrice >= PRICE_MAX ? `up to ${moneyShort(PRICE_MAX)}` : `up to ${moneyShort(state.maxPrice)}`;
    clearTimeout(rt); rt = setTimeout(() => apply(), 110);
  });
  areaIn.addEventListener('input', () => {
    state.minArea = +areaIn.value; paint(areaIn);
    host.querySelector('#o-area').textContent = `from ${num(state.minArea)} m²`;
    clearTimeout(rt); rt = setTimeout(() => apply(), 110);
  });

  const reset = () => {
    Object.assign(state, { q: '', country: 'All', type: 'All', maxPrice: PRICE_MAX, beds: 0, minArea: AREA_MIN });
    form.reset(); state.sort = 'featured';
    form.querySelectorAll('.chips').forEach((g) => g.querySelectorAll('.chip').forEach((c, i) => c.setAttribute('aria-pressed', String(i === 0))));
    [priceIn, areaIn].forEach(paint);
    host.querySelector('#o-price').textContent = `up to ${moneyShort(PRICE_MAX)}`;
    host.querySelector('#o-area').textContent = `from ${AREA_MIN} m²`;
    apply();
  };
  resetLink.addEventListener('click', reset);
  host.querySelector('.reset-all').addEventListener('click', reset);

  // mobile filter drawer
  const toggle = form.querySelector('.filters__toggle'), body = form.querySelector('.filters__body');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    form.classList.toggle('is-open', !open);
  });

  apply({ animate: false });
  return { reset, state };
}
