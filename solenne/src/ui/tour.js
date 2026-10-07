import { PHOTOS, SHOTS } from '../data/tour.js';
import { clamp, coarse, damp, lerp, loop, reduced, smooth } from './utils.js';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Scroll-driven photographic walkthrough.
 *
 * One pinned stage. The scroll position drives a virtual camera over real photographs:
 * push-ins, pans and a slow drone roll, authored per shot in data/tour.js. When the
 * photo changes, the outgoing frame keeps travelling forward while the next one
 * dissolves in, so each cut reads as stepping into the next room.
 */

const START_PAD = 0.035, END_PAD = 0.07;
const DISSOLVE = 0.32;                 // overlap between photos, in shot-weight units

const hermite = (t, m0, m1) => {
  const t2 = t * t, t3 = t2 * t;
  return (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) + (t3 - t2) * m1;
};

export class Tour {
  constructor(root, { onReady }) {
    this.root = root;
    this.caps = [...root.querySelectorAll('.cap')];
    this.rail = [...root.querySelectorAll('.rail__dot')];
    this.heroEl = root.querySelector('.tour__hero');
    this.hint = root.querySelector('.tour__hint');
    this.fillBar = root.querySelector('.rail__fill');
    this.onReady = onReady;
    this.progress = 0; this.target = 0;
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    this.visible = true;
    this.stage = 0;
    this.disposers = [];
    this.calm = reduced();

    // timeline in weight units
    let t = 0;
    this.shots = SHOTS.map((s, i) => { const a = t; t += s.w; return { ...s, i, a, b: t }; });
    this.total = t;

    // one layer per run of consecutive shots on the same photo
    this.layers = [];
    this.shots.forEach((s) => {
      const last = this.layers[this.layers.length - 1];
      if (last && last.photo === s.photo) { last.shots.push(s); last.B = s.b; }
      else this.layers.push({ photo: s.photo, shots: [s], A: s.a, B: s.b });
    });
    this.layers.forEach((l) => { l.el = root.querySelector(`.shot[data-photo="${l.photo}"][data-run="${l.A}"]`); l.img = l.el?.querySelector('img'); });
  }

  async init() {
    this.root.style.setProperty('--tour-scroll', `${this.total * (window.matchMedia('(max-width: 820px)').matches ? 0.95 : 1.1) * 100 + 50}dvh`);
    const first = this.layers[0].img;
    if (first && !first.complete) await new Promise((r) => { first.addEventListener('load', r, { once: true }); first.addEventListener('error', r, { once: true }); setTimeout(r, 4000); });
    this.bind();
    this.update(0, 0);
    this.root.classList.add('is-ready');
    this.onReady?.();
    this.disposers.push(loop((dt, time) => {
      if (!this.visible || document.hidden) return;
      this.progress = damp(this.progress, this.target, 6.5, dt);
      if (Math.abs(this.progress - this.target) < 0.00002) this.progress = this.target;
      this.mouse.x = damp(this.mouse.x, this.mouse.tx, 2.6, dt);
      this.mouse.y = damp(this.mouse.y, this.mouse.ty, 2.6, dt);
      this.update(this.progress, time);
    }));
  }

  bind() {
    const onScroll = () => {
      const r = this.root.getBoundingClientRect();
      this.target = clamp(-r.top / Math.max(1, r.height - innerHeight));
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    this.disposers.push(() => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); });

    const io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }, { rootMargin: '10% 0px' });
    io.observe(this.root);
    this.disposers.push(() => io.disconnect());

    if (!coarse() && !this.calm) {
      const mv = (e) => { this.mouse.tx = (e.clientX / innerWidth - 0.5) * 2; this.mouse.ty = (e.clientY / innerHeight - 0.5) * 2; };
      addEventListener('pointermove', mv);
      this.disposers.push(() => removeEventListener('pointermove', mv));
    }
    this.rail.forEach((d, i) => d.addEventListener('click', () => this.goTo(i)));
  }

  /** Scroll progress → position on the shot timeline. */
  tau(p) { return clamp((p - START_PAD) / (1 - START_PAD - END_PAD)) * this.total; }

  /** Camera state of a shot at local fraction f, eased so held shots settle. */
  pose(s, f) {
    const prev = this.shots[s.i - 1], next = this.shots[s.i + 1];
    const m0 = prev && prev.photo === s.photo ? 1 - 0.85 * Math.min(prev.hold ?? 0, s.hold) : 1 - 0.85 * s.hold;
    const m1 = next && next.photo === s.photo ? 1 - 0.85 * Math.min(next.hold ?? 0, s.hold) : 1 - 0.6 * s.hold;
    const e = clamp(hermite(f, m0, m1));
    return {
      s: lerp(s.from.s, s.to.s, e),
      ox: lerp(s.from.o[0], s.to.o[0], e), oy: lerp(s.from.o[1], s.to.o[1], e),
      r: lerp(s.from.r || 0, s.to.r || 0, e),
    };
  }

  update(p, time) {
    const T = this.tau(p);
    const idle = 1 - smooth(0, 0.04, p);

    this.layers.forEach((l, li) => {
      if (!l.el) return;
      let pose;
      if (T <= l.A) pose = this.pose(l.shots[0], 0);
      else if (T >= l.B) {
        // keep travelling after our last shot so the dissolve feels like forward motion
        const s = l.shots[l.shots.length - 1];
        pose = this.pose(s, 1);
        const over = clamp((T - l.B) / DISSOLVE);
        pose.s *= 1 + over * 0.14;
      } else {
        const s = l.shots.find((x) => T >= x.a && T < x.b) || l.shots[0];
        pose = this.pose(s, (T - s.a) / (s.b - s.a));
      }
      // transition in: 0 → 1 across the overlap with the previous photo
      const f = li === 0 ? 1 : easeInOut(clamp((T - (l.A - DISSOLVE * 0.5)) / DISSOLVE));
      const nextL = this.layers[li + 1];
      const covered = nextL && T > nextL.A + DISSOLVE * 0.5;
      const hidden = f <= 0.0005 || covered;
      if (l.hidden !== hidden) { l.hidden = hidden; l.el.style.visibility = hidden ? 'hidden' : 'visible'; }
      if (hidden) return;
      const enter = PHOTOS[l.photo].enter;
      if (this.calm || !enter) { l.el.style.opacity = f.toFixed(3); l.el.style.clipPath = ''; }
      else {
        l.el.style.opacity = '1';
        l.el.style.clipPath = f >= 1 ? 'none'
          : enter === 'iris' ? `circle(${(f * 78).toFixed(2)}% at ${(pose.ox * 100).toFixed(1)}% ${(pose.oy * 100).toFixed(1)}%)`
          : enter === 'right' ? `inset(0 0 0 ${((1 - f) * 100).toFixed(2)}%)`
          : `inset(0 0 ${((1 - f) * 100).toFixed(2)}% 0)`;
        pose.s *= 1 + (1 - f) * 0.1;
      }

      let { s, ox, oy, r } = pose;
      if (this.calm) { s = 1.02; r = 0; }
      // living frame: breathing at rest, and a hand-held drift toward the pointer
      s += Math.sin(time * 0.4) * 0.006 * idle;
      const px = -this.mouse.x * 9, py = -this.mouse.y * 6;
      l.img.style.transformOrigin = `${(ox * 100).toFixed(2)}% ${(oy * 100).toFixed(2)}%`;
      l.img.style.transform = `translate3d(${px.toFixed(2)}px, ${py.toFixed(2)}px, 0) scale(${s.toFixed(4)}) rotate(${r.toFixed(3)}deg)`;
    });

    // which shot is speaking: s = i at the middle of shot i
    const k = this.shots.findIndex((x) => T >= x.a && T < x.b);
    const cur = k < 0 ? this.shots.length - 1 : k;
    const sh = this.shots[cur];
    const st = cur - 0.5 + clamp((T - sh.a) / (sh.b - sh.a));
    const sIdx = k < 0 ? this.shots.length - 1 : st;
    this.updateUI(p, sIdx, cur);
  }

  updateUI(p, s, cur) {
    if (cur !== this.stage) {
      this.stage = cur;
      this.rail.forEach((d, i) => { d.classList.toggle('is-on', i === cur); if (i === cur) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
    }
    this.caps.forEach((c, i) => {
      const a = i === this.caps.length - 1 && s >= i ? 1 : 1 - smooth(0.18, 0.46, Math.abs(s - i));
      c.style.opacity = a.toFixed(3);
      c.style.transform = `translate3d(0, ${((1 - a) * (s > i ? -26 : 26)).toFixed(1)}px, 0)`;
      c.style.visibility = a < 0.01 ? 'hidden' : 'visible';
      c.classList.toggle('is-live', a > 0.5);
    });
    const heroA = 1 - smooth(0.012, 0.075, p);
    if (this.heroEl) {
      this.heroEl.style.opacity = heroA.toFixed(3);
      this.heroEl.style.transform = `translate3d(0, ${((1 - heroA) * -40).toFixed(1)}px, 0)`;
      this.heroEl.style.visibility = heroA < 0.01 ? 'hidden' : 'visible';
      this.heroEl.inert = heroA < 0.5;
    }
    if (this.hint) this.hint.style.opacity = (1 - smooth(0.004, 0.03, p)).toFixed(2);
    if (this.fillBar) this.fillBar.style.transform = `scaleY(${clamp(this.tau(p) / this.total).toFixed(4)})`;
    this.root.style.setProperty('--p', p.toFixed(4));
  }

  /** Scroll to the middle of a shot (the first and last to their rest frame). */
  goTo(i) {
    const s = this.shots[i];
    const t = i === 0 ? 0 : i === this.shots.length - 1 ? this.total : (s.a + s.b) / 2;
    const p = START_PAD + (t / this.total) * (1 - START_PAD - END_PAD);
    const r = this.root.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top + p * (r.height - innerHeight), behavior: reduced() ? 'auto' : 'smooth' });
  }

  dispose() { this.disposers.forEach((f) => f()); this.disposers = []; }
}

/** Markup for the photo layers (one per run of shots on the same photo). */
export function tourLayers() {
  const out = [];
  let t = 0, prev = null;
  SHOTS.forEach((s) => {
    if (s.photo !== prev) {
      const ph = PHOTOS[s.photo];
      const first = out.length === 0;
      out.push(`<div class="shot" data-photo="${s.photo}" data-run="${t}"><img src="${ph.src}.webp" srcset="${ph.src}-960.webp 960w, ${ph.src}.webp 1600w" sizes="100vw" alt="" style="object-position:${s.from.o[0] * 100}% ${s.from.o[1] * 100}%" decoding="async" ${first ? 'fetchpriority="high"' : ''} width="1600" height="1200"></div>`);
    }
    prev = s.photo; t += s.w;
  });
  return out.join('');
}

export { SHOTS };
