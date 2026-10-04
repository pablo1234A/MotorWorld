import { createHero } from './hero.js';
import { LINKS, PHOTOS } from './config.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const gsap = window.gsap;
const ST = window.ScrollTrigger;
if (gsap && ST) gsap.registerPlugin(ST);

// ------------------------------------------------------------------ links
for (const a of $$('[data-link]')) {
  const href = LINKS[a.dataset.link];
  if (href) a.setAttribute('href', href);
}
$$('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

// ------------------------------------------------------------------ nav
const nav = $('[data-nav]');
const heroEl = $('[data-hero]');
let lastY = scrollY;
function onScrollNav() {
  const y = scrollY;
  nav.classList.toggle('is-scrolled', y > 40);
  const pastHero = y > heroEl.offsetHeight - innerHeight * 0.5;
  nav.classList.toggle('is-hidden', pastHero && y > lastY + 2 && !menuOpen);
  if (y < lastY - 2 || !pastHero) nav.classList.remove('is-hidden');
  lastY = y;
}

const sections = $$('main section[id]');
const navLinks = $$('.nav__links a');
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
    }
  },
  { rootMargin: '-45% 0px -50% 0px' }
);
sections.forEach((s) => io.observe(s));

// mobile menu
const menu = $('[data-menu]');
const toggle = $('[data-menu-toggle]');
let menuOpen = false;
function setMenu(open) {
  menuOpen = open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) {
    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.add('is-open'));
    $('a', menu)?.focus({ preventScroll: true });
  } else {
    menu.classList.remove('is-open');
    setTimeout(() => !menuOpen && (menu.hidden = true), 350);
  }
}
toggle.addEventListener('click', () => setMenu(!menuOpen));
menu.addEventListener('click', (e) => e.target.closest('a') && setMenu(false));
addEventListener('keydown', (e) => e.key === 'Escape' && menuOpen && (setMenu(false), toggle.focus()));

// ------------------------------------------------------------------ hero
const hint = $('[data-hint]');
const pieceEl = $('[data-hero-piece]');
const resetBtn = $('[data-reset]');
const tiltBtn = $('[data-tilt]');
const pitch = $('[data-hero-pitch]');
const word = $('[data-hero-word] > span');

let hero = null;
try {
  hero = createHero({
    root: heroEl,
    canvas: $('[data-hero-canvas]'),
    labelsEl: $('[data-hero-labels]'),
    onFirstInteraction: () => hint.classList.add('is-done'),
    onPieceChange: (key, name) => {
      pieceEl.style.opacity = 0;
      setTimeout(() => {
        pieceEl.textContent = name;
        pieceEl.style.opacity = 1;
      }, 250);
      resetBtn.hidden = key === 'hero';
    },
  });
  window.__hero = hero;
  await hero.setPiece('hero');
  if (hero.needsTiltPermission) {
    tiltBtn.hidden = false;
    tiltBtn.addEventListener('click', async () => {
      const ok = await hero.enableTilt();
      tiltBtn.hidden = true;
      if (!ok) console.info('Inclinación no autorizada; la burger sigue respondiendo al tacto.');
    });
  }
  resetBtn.addEventListener('click', () => hero.setPiece('hero'));
} catch (err) {
  // WebGL unavailable: the page still works, the hero keeps its typography.
  console.warn('[Flanagan’s] 3D no disponible:', err);
  $('[data-hero-canvas]').remove();
  hint.remove();
}

requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    document.body.classList.remove('is-loading');
    $$('[data-hero-in]').forEach((el, i) => (el.style.transitionDelay = `${0.35 + i * 0.08}s`));
    if (gsap && !reduced && word) gsap.from(word, { yPercent: 14, opacity: 0, duration: 1.8, ease: 'expo.out', delay: 0.05 });
  })
);

function onScrollHero() {
  const r = heroEl.getBoundingClientRect();
  const span = Math.max(1, r.height - innerHeight);
  const p = Math.min(1, Math.max(0, -r.top / span));
  hero?.setScroll(p);
  const fade = Math.max(0, 1 - p * 2.6);
  pitch.style.opacity = fade.toFixed(3);
  pitch.style.transform = `translateY(${(-p * 40).toFixed(1)}px)`;
  pitch.style.pointerEvents = fade < 0.2 ? 'none' : '';
  if (word) {
    word.style.transform = `translateY(${(p * -6).toFixed(2)}%) scale(${(1 - p * 0.06).toFixed(4)})`;
    word.style.opacity = (1 - p * 0.55).toFixed(3);
  }
}

let ticking = false;
addEventListener(
  'scroll',
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      onScrollNav();
      onScrollHero();
      ticking = false;
    });
  },
  { passive: true }
);
onScrollNav();
onScrollHero();

// "Desmontar en 3D" from a burger card → back to the hero with that burger
for (const btn of $$('[data-explore]')) {
  btn.addEventListener('click', () => {
    if (!hero) return;
    hero.setPiece(btn.dataset.explore);
    hint.classList.remove('is-done');
    scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });
}

// ------------------------------------------------------------------ burger stills
const plates = $$('[data-plate]');
function setPlateImages(plate, a, b, isPhoto = false) {
  const media = $('[data-media]', plate);
  const [imgA, imgB] = $$('.plate__img', plate);
  imgA.onload = () => {
    imgA.classList.add('is-ready');
    media.classList.add('is-loaded');
  };
  imgA.src = a;
  if (b) {
    imgB.onload = () => imgB.classList.add('is-ready');
    imgB.src = b;
  }
  media.classList.toggle('is-photo', isPhoto);
}

const toRender = [];
for (const plate of plates) {
  const key = plate.dataset.plate;
  const photo = PHOTOS.burgers?.[key];
  if (photo) setPlateImages(plate, photo, null, true);
  else toRender.push(key);
  // touch: tap the image to see inside
  $('[data-media]', plate).addEventListener('click', (e) => e.currentTarget.classList.toggle('is-open'));
}

if (toRender.length) {
  const target = $('#burgers');
  const obs = new IntersectionObserver(
    async ([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      try {
        const { renderSnapshots } = await import('./snapshots.js');
        const shots = await renderSnapshots(toRender);
        for (const plate of plates) {
          const s = shots[plate.dataset.plate];
          if (s) setPlateImages(plate, s.assembled, s.exploded);
        }
      } catch (err) {
        console.warn('[Flanagan’s] No se pudieron generar los renders:', err);
      }
    },
    { rootMargin: '120% 0px' }
  );
  obs.observe(target);
}

// local gallery (real photos only)
if (PHOTOS.local?.length) {
  const g = $('[data-gallery]');
  g.innerHTML = PHOTOS.local.map((src, i) => `<img src="${src}" alt="Interior de Flanagan’s, foto ${i + 1}" loading="lazy" decoding="async">`).join('');
  g.hidden = false;
}

// ------------------------------------------------------------------ tabs
const tablist = $('[role="tablist"]');
const tabs = $$('[role="tab"]', tablist);
const ink = $('.tabs__ink', tablist);
function moveInk(tab) {
  ink.style.width = tab.offsetWidth + 'px';
  ink.style.transform = `translateX(${tab.offsetLeft}px)`;
}
function selectTab(tab, focus = false) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    panel.hidden = !on;
    if (on && gsap && !reduced) {
      gsap.fromTo(panel.querySelectorAll('li, .panel__feature > *, .panel__note'), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.035, ease: 'power3.out' });
    }
  }
  moveInk(tab);
  if (focus) tab.focus();
  tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
tabs.forEach((t) => t.addEventListener('click', () => selectTab(t)));
tablist.addEventListener('keydown', (e) => {
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  let n = null;
  if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
  if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
  if (e.key === 'Home') n = tabs[0];
  if (e.key === 'End') n = tabs[tabs.length - 1];
  if (n) {
    e.preventDefault();
    selectTab(n, true);
  }
});
new ResizeObserver(() => moveInk(tabs.find((t) => t.getAttribute('aria-selected') === 'true'))).observe(tablist);

// ------------------------------------------------------------------ map (lazy)
const iframe = $('[data-map-src]');
new IntersectionObserver(
  ([e], o) => {
    if (!e.isIntersecting) return;
    iframe.src = iframe.dataset.mapSrc;
    o.disconnect();
  },
  { rootMargin: '60% 0px' }
).observe(iframe);

// ------------------------------------------------------------------ today
(() => {
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  let d;
  try {
    d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' })).getDay();
  } catch {
    d = new Date().getDay();
  }
  const rows = $$('.hours > div');
  const row = d === 1 ? rows[0] : d === 2 || d === 3 ? rows[1] : rows[2];
  row?.classList.add('is-today');
  const el = $('[data-open-now]');
  const txt = d === 1 ? 'cerrado, volvemos mañana a las 20:00' : d === 2 || d === 3 ? 'cenas desde las 20:00' : 'comidas desde las 12:30 y cenas desde las 20:00';
  el.textContent = `Hoy, ${days[d]}: ${txt}.`;
  el.classList.toggle('is-open', d !== 1);
})();

// ------------------------------------------------------------------ motion
function splitWords(el) {
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(document.createTextNode(' '));
          const mask = document.createElement('span');
          mask.className = 'line-mask';
          const inner = document.createElement('span');
          inner.textContent = part;
          mask.append(inner);
          frag.append(mask);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') walk(child);
    }
  };
  walk(el);
  return $$('.line-mask > span', el);
}

if (gsap && ST && !reduced) {
  document.documentElement.classList.add('reveal-ready');

  for (const el of $$('[data-split]')) {
    const words = splitWords(el);
    gsap.set(words, { yPercent: 110 });
    ST.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () => gsap.to(words, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.045 }),
    });
  }

  ST.batch('[data-reveal]', {
    start: 'top 90%',
    once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
  });

  for (const media of $$('[data-media]')) {
    gsap.fromTo(
      media,
      { clipPath: 'inset(14% 10% 14% 10% round 14px)' },
      { clipPath: 'inset(0% 0% 0% 0% round 14px)', ease: 'none', scrollTrigger: { trigger: media, start: 'top 95%', end: 'top 35%', scrub: 0.6 } }
    );
    gsap.fromTo($('.plate__stage', media), { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: media, start: 'top 95%', end: 'bottom 30%', scrub: 0.6 } });
  }

  for (const n of $$('[data-count]')) {
    const to = parseFloat(n.dataset.count);
    const dec = +n.dataset.decimals;
    const obj = { v: 0 };
    ST.create({
      trigger: n,
      start: 'top 90%',
      once: true,
      onEnter: () =>
        gsap.to(obj, {
          v: to,
          duration: 1.6,
          ease: 'power3.out',
          onUpdate: () => (n.textContent = obj.v.toFixed(dec).replace('.', ',')),
        }),
    });
  }

  gsap.fromTo('.final__title', { scale: 0.92 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.final', start: 'top bottom', end: 'center center', scrub: 0.8 } });

  addEventListener('load', () => ST.refresh());
}

// first paint of the tab ink after fonts settle
document.fonts?.ready.then(() => moveInk(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));
moveInk(tabs[0]);
