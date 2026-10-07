import { $$, clamp, coarse, lerp, reduced } from './utils.js';

/** Split an element's text into masked words so headings can rise line by line. */
export function splitWords(el) {
  if (el.dataset.split) return;
  el.dataset.split = '1';
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((tok) => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { frag.append(' '); return; }
          const w = document.createElement('span'); w.className = 'w';
          const i = document.createElement('span'); i.textContent = tok; w.append(i);
          frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
  };
  walk(el);
  el.querySelectorAll('.w > span').forEach((s, i) => s.style.setProperty('--i', i));
}

/** Reveal-on-view for [data-reveal] (and word-split headings). Returns a disposer. */
export function reveals(root = document) {
  const targets = $$('[data-reveal]', root);
  targets.forEach((t) => { if (t.dataset.reveal === 'words') splitWords(t); });
  if (reduced() || !('IntersectionObserver' in window)) { targets.forEach((t) => t.classList.add('is-in')); return () => {}; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  targets.forEach((t) => io.observe(t));
  return () => io.disconnect();
}

/** Count numbers up once when they enter the viewport. */
export function counters(root = document) {
  const els = $$('[data-count]', root);
  const fmt = new Intl.NumberFormat('en-GB');
  const run = (el) => {
    const to = parseFloat(el.dataset.count);
    if (reduced()) { el.textContent = fmt.format(to); return; }
    const t0 = performance.now(), dur = 1700;
    const tick = (now) => {
      const p = clamp((now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt.format(Math.round(to * e));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } }), { threshold: 0.6 });
  els.forEach((e) => { e.textContent = '0'; io.observe(e); });
  return () => io.disconnect();
}

/** Buttons that lean toward the pointer. */
export function magnetic(root = document) {
  if (coarse() || reduced()) return () => {};
  const offs = [];
  $$('[data-magnetic]', root).forEach((el) => {
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * 0.22, y = (e.clientY - (r.top + r.height / 2)) * 0.32;
      el.style.transform = `translate(${x}px, ${y}px)`;
    };
    const leave = () => { el.style.transform = ''; };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    offs.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); });
  });
  return () => offs.forEach((f) => f());
}

/** Images gain depth: the picture counter-moves inside its frame. */
export function depthTiles(root = document) {
  if (coarse() || reduced()) return () => {};
  const offs = [];
  $$('[data-depth]', root).forEach((el) => {
    const inner = el.querySelector('[data-depth-inner]') || el.firstElementChild;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const step = () => {
      cx = lerp(cx, tx, 0.1); cy = lerp(cy, ty, 0.1);
      inner.style.transform = `translate3d(${cx * -14}px, ${cy * -10}px, 0) scale(1.07)`;
      if (Math.abs(cx - tx) > 0.002 || Math.abs(cy - ty) > 0.002) raf = requestAnimationFrame(step); else raf = 0;
    };
    const move = (e) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(step);
    };
    const leave = () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(step); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    offs.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); });
  });
  return () => offs.forEach((f) => f());
}

/** Parallax for [data-parallax="0.2"] — translate only, passive, rAF-throttled via IntersectionObserver. */
export function parallax(root = document) {
  if (reduced()) return () => {};
  const items = $$('[data-parallax]', root).map((el) => ({ el, k: parseFloat(el.dataset.parallax) || 0.15, vis: true, io: el.parentElement || el }));
  if (!items.length) return () => {};
  const io = new IntersectionObserver((es) => es.forEach((e) => { items.filter((i) => i.io === e.target).forEach((i) => { i.vis = e.isIntersecting; }); }), { rootMargin: '20% 0px' });
  items.forEach((i) => io.observe(i.io));
  let raf = 0, ticking = false;
  const update = () => {
    ticking = false;
    const vh = innerHeight;
    items.forEach((i) => {
      const r = i.io.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      const c = (r.top + r.height / 2 - vh / 2) / vh;
      i.el.style.transform = `translate3d(0, ${(-c * i.k * 100).toFixed(2)}px, 0) scale(1.12)`;
    });
  };
  const onScroll = () => { if (!ticking) { ticking = true; raf = requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();
  return () => { io.disconnect(); removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
}

/** Custom cursor: a ring that grows over links and shows a label over [data-cursor]. */
export function initCursor() {
  if (coarse() || reduced()) return;
  const c = document.createElement('div');
  c.className = 'cursor'; c.setAttribute('aria-hidden', 'true');
  c.innerHTML = '<div class="cursor__ring"><span class="cursor__label"></span></div>';
  document.body.append(c);
  document.body.classList.add('has-cursor');
  const label = c.querySelector('.cursor__label');
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
  addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; c.classList.add('is-on'); });
  document.addEventListener('pointerleave', () => c.classList.remove('is-on'));
  addEventListener('pointerdown', () => c.classList.add('is-down'));
  addEventListener('pointerup', () => c.classList.remove('is-down'));
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-cursor], a, button, [role="button"], summary, label');
    c.classList.remove('is-link', 'is-label');
    if (!t) return;
    if (t.dataset?.cursor) { label.textContent = t.dataset.cursor; c.classList.add('is-label'); }
    else c.classList.add('is-link');
  });
  const tick = () => {
    cx = lerp(cx, x, 0.22); cy = lerp(cy, y, 0.22);
    c.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    requestAnimationFrame(tick);
  };
  tick();
}
