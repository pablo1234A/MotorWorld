// HERO — the interactive burger.
//
// Input model (all inputs end up as three numbers):
//   nx  ∈ [-1, 1]  horizontal intent  → orbit, lean, lateral parallax
//   ny  ∈ [-1, 1]  vertical intent    → camera height + disassembly
//   ex  ∈ [0, 1]   explode amount     → layer separation (springs)
// Desktop drives them with the cursor, touch devices with drag, tilt,
// tap and scroll. Everything is low-pass filtered, then each layer adds
// its own spring on top, which is where the "physical" feel comes from.
import * as THREE from 'three';
import { Burger } from './burger/Burger.js';
import { createRenderer, createStage } from './burger/stage.js';
import { HERO_MODEL, HERO_NAMES } from './config.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export function createHero({ root, canvas, labelsEl, onFirstInteraction, onPieceChange }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(hover: none), (pointer: coarse)').matches;

  const renderer = createRenderer(canvas);
  const { scene, shadow } = createStage(renderer, { shadowMapSize: touch ? 512 : 1024 });
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const pivot = new THREE.Group();
  scene.add(pivot);

  let burger = null;
  let outgoing = [];
  let labels = [];

  // ---------------------------------------------------------------- input
  const input = {
    px: 0, py: 0, // raw pointer
    nx: 0, ny: 0, ex: 0, // smoothed
    scroll: 0,
    pinned: 0, // tap-to-explode on touch
    tiltX: 0, tiltY: 0,
    spin: 0, spinV: 0,
    active: false,
    interacted: false,
  };

  function markInteraction() {
    if (!input.interacted) {
      input.interacted = true;
      onFirstInteraction?.();
    }
  }

  if (!touch) {
    let moved = 0;
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
        const r = root.getBoundingClientRect();
        if (e.clientY > r.bottom) return;
        input.px = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
        input.py = clamp(-(((e.clientY - r.top) / Math.min(r.height, innerHeight)) * 2 - 1), -1, 1);
        input.active = true;
        if (++moved > 25 && Math.abs(input.py) > 0.35) markInteraction();
      },
      { passive: true }
    );
    document.documentElement.addEventListener('pointerleave', () => (input.active = false));
    window.addEventListener('blur', () => (input.active = false));
  } else {
    let lastX = null, startX = 0, startY = 0, t0 = 0;
    canvas.addEventListener('pointerdown', (e) => {
      lastX = startX = e.clientX;
      startY = e.clientY;
      t0 = performance.now();
    });
    canvas.addEventListener(
      'pointermove',
      (e) => {
        if (lastX === null) return;
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        input.spinV += dx * 0.012;
        input.px = clamp(input.px + dx / 160, -1, 1);
      },
      { passive: true }
    );
    const end = (e) => {
      if (lastX === null) return;
      const quick = performance.now() - t0 < 280;
      const still = Math.hypot(e.clientX - startX, e.clientY - startY) < 10;
      if (quick && still) {
        input.pinned = input.pinned ? 0 : 1;
        markInteraction();
      }
      lastX = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', () => (lastX = null));
  }

  // Device tilt (Android fires straight away; iOS needs a user gesture).
  function onOrient(e) {
    if (e.gamma == null) return;
    input.tiltX = clamp(e.gamma / 28, -1, 1);
    input.tiltY = clamp(-(e.beta - 50) / 30, -1, 1);
  }
  const needsPermission = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
  if (touch && !needsPermission) window.addEventListener('deviceorientation', onOrient, { passive: true });
  async function enableTilt() {
    try {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res === 'granted') window.addEventListener('deviceorientation', onOrient, { passive: true });
      return res === 'granted';
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- labels
  function buildLabels() {
    labelsEl.innerHTML = '';
    labels = burger.layers.map((L, i) => {
      const el = document.createElement('li');
      el.className = 'layer-label';
      el.innerHTML = `<span class="layer-label__line"></span><span class="layer-label__idx">${String(i + 1).padStart(2, '0')}</span><span class="layer-label__txt"></span>`;
      el.querySelector('.layer-label__txt').textContent = L.label;
      labelsEl.appendChild(el);
      return el;
    });
    measureLabels();
  }
  // widths are cached so the frame loop never forces a layout
  function measureLabels() {
    requestAnimationFrame(() => labels.forEach((el) => (el._w = el.offsetWidth)));
  }
  document.fonts?.ready.then(measureLabels);

  const v = new THREE.Vector3();
  const right = new THREE.Vector3();
  function updateLabels(alpha, w, h) {
    labelsEl.style.opacity = alpha.toFixed(3);
    if (alpha < 0.01) return;
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    const narrow = w < 720 || w / h < 0.9;
    burger.layers.forEach((L, i) => {
      const el = labels[i];
      L.holder.getWorldPosition(v);
      v.y += L.height * 0.5;
      const side = narrow ? (i % 2 ? -1 : 1) : 1;
      v.addScaledVector(right, side * (narrow ? 0.95 : 1.28));
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      el.classList.toggle('is-left', side < 0);
      // keep every label fully on screen
      const lw = el._w || 120;
      const cx = side < 0 ? Math.max(lw + 8, x) : Math.min(w - lw - 8, x);
      el.style.transform = `translate3d(${cx.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      // stagger reveal: lower layers appear slightly later
      const local = clamp(alpha * 1.6 - (i / labels.length) * 0.6);
      el.style.opacity = local.toFixed(3);
    });
  }

  // ---------------------------------------------------------------- model
  async function makeBurger(key) {
    if (key === 'hero' && HERO_MODEL.type === 'glb') {
      try {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const gltf = await new GLTFLoader().loadAsync(HERO_MODEL.url);
        return Burger.fromObject3D(gltf.scene, { labels: HERO_MODEL.labels });
      } catch (err) {
        console.warn('[Flanagan’s] GLB no disponible, usando modelo procedural.', err);
      }
    }
    return Burger.fromRecipe(key === 'hero' ? HERO_MODEL.recipe || 'anatomia' : key);
  }

  let current = null;
  async function setPiece(key = 'hero') {
    if (key === current) return;
    current = key;
    const next = await makeBurger(key);
    if (burger) {
      const old = burger;
      old.exit();
      outgoing.push(old);
      setTimeout(() => {
        old.dispose();
        outgoing = outgoing.filter((b) => b !== old);
      }, 900);
    }
    burger = next;
    pivot.add(burger.group);
    if (reduced) burger.pose({ explode: 0 });
    else burger.intro({ from: 6.5, stagger: outgoing.length ? 0.06 : 0.085 });
    buildLabels();
    const name = key === 'hero' ? HERO_NAMES[HERO_MODEL.recipe] || HERO_NAMES.anatomia : HERO_NAMES[key];
    onPieceChange?.(key, name);
  }

  // ---------------------------------------------------------------- layout
  let W = 0, H = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.5 : 1.75));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    if (labels.length) measureLabels();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // ---------------------------------------------------------------- loop
  let running = false, last = performance.now(), raf = 0;
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const look = new THREE.Vector3();
  let lastEx = -1;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 15);
    last = now;
    if (!burger) return;

    // --- resolve intent
    let tx = 0, ty = 0, tex = 0;
    if (!touch) {
      if (input.active) {
        tx = input.px;
        ty = input.py;
        tex = Math.max(smoothstep(0.14, 0.88, Math.abs(ty)), smoothstep(0.55, 1, Math.abs(tx)) * 0.3);
      }
    } else {
      input.px = damp(input.px, 0, 1.5, dt);
      tx = clamp(input.px + input.tiltX * 0.8, -1, 1);
      ty = input.tiltY * 0.5;
      tex = input.pinned;
    }
    tex = Math.max(tex, smoothstep(0.04, 0.85, input.scroll));

    input.nx = damp(input.nx, tx, reduced ? 2 : 3.6, dt);
    input.ny = damp(input.ny, ty, reduced ? 2 : 3.6, dt);
    input.ex = damp(input.ex, tex, reduced ? 3 : 3.2, dt);

    const nx = input.nx, ny = input.ny, ex = input.ex;

    // --- spin with inertia
    input.spinV = damp(input.spinV, 0, 2.2, dt);
    if (!reduced) input.spin += dt * 0.16 * (1 - ex * 0.7) + input.spinV * dt;

    pivot.rotation.set(-ny * 0.12 + 0.04, input.spin + nx * 0.62, -nx * 0.05);

    // --- layers
    const compact = W < 720 || camera.aspect < 0.9;
    const spread = compact ? 0.42 : 0.5;
    burger.update(dt, { explode: ex, nx, spread, float: reduced ? 0 : 1 });
    for (const b of outgoing) b.update(dt, { explode: 0 });

    // --- camera: frame the stack whatever its height
    const halfH = Math.max(compact ? 1.7 : 2.05, burger.height / 2 + ex * spread * (burger.layers.length - 1) * 0.5 + 0.5);
    const halfW = compact ? 1.5 + ex * 1.15 : 2.7;
    const dist = Math.max(halfH / Math.tan(halfFov), halfW / (Math.tan(halfFov) * camera.aspect)) + 2.2;
    camera.position.set(nx * 1.1, 1.0 + ny * 1.6 + ex * 0.4, dist);
    look.set(nx * 0.08, ny * 0.18, 0);
    camera.lookAt(look);
    // a whisper of dutch angle following the cursor
    camera.rotateZ(-nx * 0.018);

    // --- contact shadow follows the bottom bun
    shadow.position.y = burger.bottom - 0.02;
    const lift = Math.max(0, burger.layers[burger.layers.length - 1].s.y);
    shadow.material.opacity = 0.8 * (1 - ex * 0.35) / (1 + lift * 0.6);
    shadow.scale.setScalar(1 + ex * 0.25 + lift * 0.15);

    renderer.render(scene, camera);
    if (Math.abs(ex - lastEx) > 0.002) {
      root.style.setProperty('--ex', ex.toFixed(3));
      lastEx = ex;
    }
    updateLabels(smoothstep(0.32, 0.75, ex), W, H);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // Only render while a meaningful slice of the hero is on screen.
  new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? start() : stop()), {
    rootMargin: '-18% 0px 0px 0px',
  }).observe(root);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (root.getBoundingClientRect().bottom > innerHeight * 0.18) start();
  });

  return {
    setPiece,
    setScroll(p) {
      input.scroll = p;
    },
    get touch() {
      return touch;
    },
    needsTiltPermission: touch && needsPermission,
    enableTilt,
    get state() {
      return { nx: input.nx, ny: input.ny, ex: input.ex, settled: burger?.settled, piece: current };
    },
    start,
  };
}
