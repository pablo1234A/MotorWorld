// A burger is an ordered stack of independent layers. Every layer owns a
// small damped-spring state so the stack can split apart, twist and settle
// with real inertia instead of a canned tween.
import * as THREE from 'three';
import { buildLayers } from './recipes.js';

const STEP = 1 / 120;

function spring(k, zeta) {
  return { k, c: 2 * Math.sqrt(k) * zeta };
}

export class Burger {
  /**
   * @param {Array<{object: THREE.Object3D, height: number, label: string}>} layers top → bottom
   */
  constructor(layers, { gap = -0.012 } = {}) {
    this.group = new THREE.Group();
    this.layers = [];
    const n = layers.length;
    let y = 0;
    for (let i = n - 1; i >= 0; i--) {
      const src = layers[i];
      const holder = new THREE.Group();
      holder.add(src.object);
      const j = n - 1 - i; // 0 = bottom
      const h = Math.sin(j * 12.9898) * 43758.5453;
      const rand = h - Math.floor(h);
      this.layers.unshift({
        label: src.label,
        holder,
        height: src.height,
        baseY: y,
        index: j,
        rand,
        // position/rotation springs (value, velocity)
        s: { y: 0, vy: 0, x: 0, vx: 0, ry: 0, vry: 0, rx: 0, vrx: 0, rz: 0, vrz: 0 },
        sp: spring(70 + rand * 55, 0.5 + rand * 0.2),
        hold: 0,
      });
      y += src.height + gap;
    }
    this.height = y - gap;
    for (const L of this.layers) {
      L.baseY -= this.height / 2;
      L.holder.position.y = L.baseY;
      this.group.add(L.holder);
    }
    this.mode = 'idle';
    this.time = 0;
  }

  static fromRecipe(key) {
    return new Burger(buildLayers(key));
  }

  /**
   * Wraps a loaded GLTF scene. Layers are meshes/groups named "layer_*"
   * (or carrying userData.layer). Order is taken from their height.
   */
  static fromObject3D(root, { labels = {}, diameter = 2.1 } = {}) {
    root.updateMatrixWorld(true);
    let parts = [];
    root.traverse((o) => {
      if (o !== root && (/^layer[_-]?/i.test(o.name) || o.userData?.layer)) parts.push(o);
    });
    if (!parts.length) parts = [...root.children];
    const whole = new THREE.Box3().setFromObject(root);
    const size = whole.getSize(new THREE.Vector3());
    const scale = diameter / Math.max(size.x, size.z || size.x);
    const layers = parts
      .map((o) => {
        const box = new THREE.Box3().setFromObject(o);
        return { o, box };
      })
      .sort((a, b) => b.box.min.y - a.box.min.y)
      .map(({ o, box }) => {
        const wrap = new THREE.Group();
        const clone = o.clone(true);
        clone.applyMatrix4(o.parent.matrixWorld);
        const c = box.getCenter(new THREE.Vector3());
        clone.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
        wrap.add(clone);
        wrap.scale.setScalar(scale);
        wrap.traverse((m) => {
          if (m.isMesh) m.castShadow = m.receiveShadow = true;
        });
        const name = o.name.replace(/^layer[_-]?/i, '');
        return {
          object: wrap,
          height: (box.max.y - box.min.y) * scale,
          label: labels[name] || o.userData?.label || name.replace(/[_-]/g, ' '),
        };
      });
    return new Burger(layers, { gap: 0 });
  }

  /** Drop the layers in from above, bottom bun first. */
  intro({ from = 7, stagger = 0.075 } = {}) {
    for (const L of this.layers) {
      L.s.y = from + L.index * 0.35;
      L.s.vy = 0;
      L.s.ry = (L.rand - 0.5) * 1.6;
      L.hold = L.index * stagger;
    }
    this.mode = 'idle';
  }

  exit() {
    this.mode = 'exit';
    for (const L of this.layers) L.hold = (this.layers.length - 1 - L.index) * 0.035;
  }

  /** Jump straight to a pose (used for still renders). */
  pose(state) {
    this._targets(state);
    for (const L of this.layers) {
      Object.assign(L.s, { y: L.t.y, x: L.t.x, ry: L.t.ry, rx: L.t.rx, rz: L.t.rz, vy: 0, vx: 0, vry: 0, vrx: 0, vrz: 0 });
      L.hold = 0;
    }
    this._apply();
  }

  _targets({ explode = 0, nx = 0, spread = 0.52, float = 0 }) {
    const n = this.layers.length;
    const mid = (n - 1) / 2;
    for (const L of this.layers) {
      const j = L.index;
      const rel = mid ? (j - mid) / mid : 0; // -1 bottom … 1 top
      const e = explode;
      const t = L.t || (L.t = {});
      if (this.mode === 'exit') {
        t.y = 9 + j * 0.4;
        t.x = 0;
        t.ry = (L.rand - 0.5) * 2;
        t.rx = t.rz = 0;
        continue;
      }
      const breathe = Math.sin(this.time * 1.1 + j * 1.3) * 0.035 * e * float;
      t.y = (j - mid) * spread * e + breathe;
      t.x = e * nx * 0.32 * rel;
      t.ry = e * 0.22 * Math.sin(j * 1.9 + 0.4) + nx * e * 0.28 * rel;
      t.rx = e * 0.07 * Math.sin(j * 2.7);
      t.rz = e * (0.05 * Math.cos(j * 2.1) - nx * 0.06 * rel);
    }
  }

  _apply() {
    for (const L of this.layers) {
      const h = L.holder;
      h.position.set(L.s.x, L.baseY + L.s.y, 0);
      h.rotation.set(L.s.rx, L.s.ry, L.s.rz);
    }
  }

  update(dt, state) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    this._targets(state);
    let acc = dt;
    while (acc > 1e-6) {
      const h = Math.min(STEP, acc);
      acc -= h;
      for (const L of this.layers) {
        if (L.hold > 0) {
          L.hold -= h;
          continue;
        }
        const { k, c } = this.mode === 'exit' ? { k: 40, c: 6 } : L.sp;
        const s = L.s, t = L.t;
        s.vy += (k * (t.y - s.y) - c * s.vy) * h;
        s.vx += (k * (t.x - s.x) - c * s.vx) * h;
        s.vry += (k * (t.ry - s.ry) - c * s.vry) * h;
        s.vrx += (k * (t.rx - s.rx) - c * s.vrx) * h;
        s.vrz += (k * (t.rz - s.rz) - c * s.vrz) * h;
        s.y += s.vy * h;
        s.x += s.vx * h;
        s.ry += s.vry * h;
        s.rx += s.vrx * h;
        s.rz += s.vrz * h;
      }
    }
    this._apply();
  }

  /** True once every layer is back on its resting pose. */
  get settled() {
    return this.layers.every((L) => L.hold <= 0 && Math.abs(L.s.y) < 1e-3 && Math.abs(L.s.vy) < 1e-3 && Math.abs(L.s.ry) < 1e-3);
  }

  /** Lowest point of the stack in local space (for the contact shadow). */
  get bottom() {
    const b = this.layers[this.layers.length - 1];
    return b.baseY + b.s.y;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) o.geometry?.dispose();
    });
    this.group.removeFromParent();
  }
}
