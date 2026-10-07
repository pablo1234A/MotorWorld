import * as THREE from 'three';
import { TOUR, STAGES } from '../world/shots.js';
import { clamp, coarse, damp, lerp, loop, reduced, smooth } from './utils.js';

/**
 * Scroll-driven walkthrough.
 *
 * One pinned stage; the scroll position is the camera's position on a path through
 * the house. Time on each room is authored with `hold` values in shots.js: the camera
 * settles at a key and lingers (the copy peaks there), then accelerates to the next.
 *
 * Modes
 *   live    real-time WebGL world (default)
 *   stills  pre-rendered frames cross-faded in sequence (no WebGL, reduced motion, very slow GPUs)
 */

const SEG_WEIGHT = [0.55, 0.5, 0.5, 0.55, 0.35, 0.3, 0.75, 0.65, 0.4, 0.4, 0.6, 0.35, 0.6, 0.55, 0.5, 0.55];
const START_PAD = 0.035, END_PAD = 0.07;
const STILL_KEYS = ['s00', 's02', 's04', 's06', 's07', 's10', 's12', 's13', 's15', 's16'];

const hermite = (t, m0, m1) => {
  const t2 = t * t, t3 = t2 * t;
  return (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) + (t3 - t2) * m1;
};

export class Tour {
  constructor(root, { onReady, stillsBase }) {
    this.root = root;
    this.pin = root.querySelector('.tour__pin');
    this.canvas = root.querySelector('.tour__canvas');
    this.caps = [...root.querySelectorAll('.cap')];
    this.rail = [...root.querySelectorAll('.rail__dot')];
    this.heroEl = root.querySelector('.tour__hero');
    this.hint = root.querySelector('.tour__hint');
    this.stills = [...root.querySelectorAll('.still')];
    this.fillBar = root.querySelector('.rail__fill');
    this.onReady = onReady;
    this.stillsBase = stillsBase;
    this.mode = 'live';
    this.progress = 0; this.target = 0;
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    this.visible = false;
    this.stage = 0;
    this.disposers = [];

    const sum = SEG_WEIGHT.reduce((a, b) => a + b, 0);
    let acc = 0;
    this.cum = [0, ...SEG_WEIGHT.map((w) => (acc += w) / sum)];
    this.stageAt = STAGES.map((s) => s.at);
  }

  async init() {
    const wantStills = reduced() || !this.webglOK();
    this.setLength(wantStills);
    if (wantStills) { this.startStills(); return; }
    try {
      await this.startLive();
    } catch (err) {
      console.warn('[tour] WebGL unavailable, falling back to stills', err);
      this.startStills();
    }
  }

  webglOK() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch { return false; }
  }

  /** Section height = pinned viewport + scroll distance. */
  setLength(stills) {
    const mobile = window.matchMedia('(max-width: 820px)').matches;
    const vh = stills ? 0.8 * (STAGES.length - 1) + 0.6 : SEG_WEIGHT.reduce((a, b) => a + b, 0) * (mobile ? 0.95 : 1.1) + 0.5;
    this.root.style.setProperty('--tour-scroll', `${vh * 100}dvh`);
  }

  /* ------------------------------------------------------------- live mode */

  async startLive() {
    const [{ World }, { VILLAS }] = await Promise.all([import('../world/world.js'), import('../data/villas.js')]);
    const hero = VILLAS[0];
    const weak = coarse() || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
    this.quality = weak ? 'low' : 'high';
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
    this.world = new World(this.canvas, hero.render, { quality: this.quality, tod: 1 });
    this.baseDpr = this.world.pixelRatioCap;
    this.root.classList.add('is-live');

    // camera path
    const pts = (k) => TOUR.map((t) => new THREE.Vector3(...t[k]));
    this.posCurve = new THREE.CatmullRomCurve3(pts('pos'), false, 'centripetal');
    this.lookCurve = new THREE.CatmullRomCurve3(pts('look'), false, 'centripetal');

    const resize = () => {
      const r = this.canvas.getBoundingClientRect();
      this.world.resize(Math.max(2, r.width), Math.max(2, r.height));
      this.aspectFov();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(this.canvas);
    this.disposers.push(() => ro.disconnect());

    this.bindShared();
    this.updateCamera(0, 0, true);
    this.world.render(0.016);
    this.world.render(0.016);
    this.onReady?.();

    const frameTimes = [];
    const stop = loop((dt, t) => {
      if (!this.visible || document.hidden) return;
      this.progress = damp(this.progress, this.target, 7.5, dt);
      if (Math.abs(this.progress - this.target) < 0.00005) this.progress = this.target;
      this.mouse.x = damp(this.mouse.x, this.mouse.tx, 3.2, dt);
      this.mouse.y = damp(this.mouse.y, this.mouse.ty, 3.2, dt);
      this.updateCamera(this.progress, t);
      this.world.render(dt);
      this.updateUI(this.progress);
      // adaptive resolution
      frameTimes.push(dt); if (frameTimes.length > 50) frameTimes.shift();
      if (frameTimes.length === 50) {
        const avg = frameTimes.reduce((a, b) => a + b, 0) / 50;
        const cap = this.world.pixelRatioCap;
        if (avg > 1 / 40 && cap > 0.8) { this.world.pixelRatioCap = Math.max(0.8, cap - 0.2); resize(); frameTimes.length = 0; }
        else if (avg < 1 / 62 && cap < this.baseDpr) { this.world.pixelRatioCap = Math.min(this.baseDpr, cap + 0.1); resize(); frameTimes.length = 0; }
      }
    });
    this.disposers.push(stop);
    this.disposers.push(() => this.world.dispose());
  }

  aspectFov() {
    // keep horizontal coverage constant when the viewport is narrower than 16:9
    this.aspectScale = this.world.camera.aspect;
  }

  /** Map overall scroll progress to a fractional keyframe index and the eased position along the path. */
  mapProgress(p) {
    const q = clamp((p - START_PAD) / (1 - START_PAD - END_PAD));
    let i = 0;
    while (i < this.cum.length - 2 && q >= this.cum[i + 1]) i++;
    const f = clamp((q - this.cum[i]) / (this.cum[i + 1] - this.cum[i]));
    const hA = TOUR[i].hold, hB = TOUR[i + 1].hold;
    const e = clamp(hermite(f, 1 - 0.92 * hA, 1 - 0.92 * hB), 0, 1);
    return { i, e, u: i + e };
  }

  updateCamera(p, time, first = false) {
    const { i, e, u } = this.mapProgress(p);
    const n = TOUR.length - 1;
    const t = clamp(u / n);
    const w = this.world;
    const pos = this.posCurve.getPoint(t), look = this.lookCurve.getPoint(t);
    const a = TOUR[i], b = TOUR[Math.min(i + 1, n)];
    let fov = lerp(a.fov, b.fov, e);
    const tod = lerp(a.tod, b.tod, e);

    // living breath at the very start, so the opening frame is never static
    const idle = 1 - smooth(0, 0.05, p);
    pos.x += Math.sin(time * 0.35) * 0.9 * idle; pos.y += Math.sin(time * 0.5) * 0.25 * idle;

    // pointer parallax: shift the look target a little, scaled by distance
    const dist = pos.distanceTo(look);
    const fwd = look.clone().sub(pos).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const k = dist * 0.035;
    look.addScaledVector(right, this.mouse.x * k).addScaledVector(new THREE.Vector3(0, 1, 0), -this.mouse.y * k * 0.55);
    pos.addScaledVector(right, this.mouse.x * k * 0.35);

    // narrower than 16:9 → widen vertical fov so the same width stays in frame
    const asp = w.camera.aspect;
    if (asp < 16 / 9) {
      const fh = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * (16 / 9));
      fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(fh / 2) / asp));
      fov = Math.min(fov, 88);
    }
    w.setCamera([pos.x, pos.y, pos.z], [look.x, look.y, look.z], fov);
    // portrait: lift the subject into the upper part of the frame, clear of the copy
    const { w: cw, h: ch } = w.size;
    if (asp < 0.9) w.camera.setViewOffset(cw, ch, 0, ch * 0.16, cw, ch);
    else if (w.camera.view?.enabled) w.camera.clearViewOffset();
    if (first || Math.abs(tod - (this._tod ?? -9)) > 0.004) { this._tod = tod; w.setTimeOfDay(tod); }
    this.u = u;
  }

  /* ------------------------------------------------------------ stills mode */

  startStills() {
    this.mode = 'stills';
    this.root.classList.add('is-stills');
    this.bindShared();
    this.onReady?.();
    const upd = () => { this.progress = this.target; this.updateUI(this.progress); };
    this.disposers.push(loop(() => { if (this.visible) { this.progress = damp(this.progress, this.target, 9, 1 / 60); this.updateUI(this.progress); } }));
    upd();
  }

  /* ------------------------------------------------------------- shared UI */

  bindShared() {
    const onScroll = () => {
      const r = this.root.getBoundingClientRect();
      const range = Math.max(1, r.height - innerHeight);
      this.target = clamp(-r.top / range);
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    this.disposers.push(() => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); });

    const io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }, { rootMargin: '10% 0px' });
    io.observe(this.root);
    this.disposers.push(() => io.disconnect());

    if (!coarse()) {
      const mv = (e) => { this.mouse.tx = (e.clientX / innerWidth - 0.5) * 2; this.mouse.ty = (e.clientY / innerHeight - 0.5) * 2; };
      addEventListener('pointermove', mv);
      this.disposers.push(() => removeEventListener('pointermove', mv));
    }

    this.rail.forEach((d, i) => d.addEventListener('click', () => this.goTo(i)));
    this.jumpTop = this.root.querySelector('[data-skip]');
  }

  /** Continuous stage index (0…STAGES-1) for the given overall progress. */
  stageIndex(p) {
    if (this.mode === 'live') {
      const u = this.mapProgress(p).u, at = this.stageAt;
      if (u <= at[0]) return 0;
      for (let s = 0; s < at.length - 1; s++) if (u < at[s + 1]) return s + (u - at[s]) / (at[s + 1] - at[s]);
      return at.length - 1;
    }
    const q = clamp((p - 0.02) / 0.96);
    return q * (STAGES.length - 1);
  }

  updateUI(p) {
    const s = this.stageIndex(p);
    const near = Math.round(s);
    if (near !== this.stage) { this.stage = near; this.rail.forEach((d, i) => { d.classList.toggle('is-on', i === near); if (i === near) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); }); }
    this.caps.forEach((c, i) => {
      const a = 1 - smooth(0.16, 0.44, Math.abs(s - i));
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
    if (this.fillBar) this.fillBar.style.transform = `scaleY(${clamp(s / (STAGES.length - 1)).toFixed(4)})`;
    if (this.mode === 'stills') {
      this.stills.forEach((im, i) => {
        const a = 1 - smooth(0, 1, Math.abs(s - i));
        im.style.opacity = a.toFixed(3);
        im.style.transform = `scale(${(1.04 + (s - i) * 0.035).toFixed(4)})`;
      });
    }
    this.root.style.setProperty('--p', p.toFixed(4));
  }

  /** Scroll so that the given stage index is centred. */
  goTo(stageIdx) {
    const r = this.root.getBoundingClientRect();
    const range = r.height - innerHeight;
    let p;
    if (this.mode === 'live') {
      const q = this.cum[this.stageAt[stageIdx]];
      p = START_PAD + q * (1 - START_PAD - END_PAD);
    } else p = 0.02 + (stageIdx / (STAGES.length - 1)) * 0.96;
    const y = window.scrollY + r.top + p * range;
    window.scrollTo({ top: y, behavior: reduced() ? 'auto' : 'smooth' });
  }

  dispose() {
    this.disposers.forEach((f) => f());
    this.disposers = [];
  }
}
