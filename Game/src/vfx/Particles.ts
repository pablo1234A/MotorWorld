import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, NormalBlending, Points, Scene, ShaderMaterial, Vector3 } from 'three';

export type ParticleKind = 'smoke' | 'dust' | 'spark' | 'spray' | 'flame' | 'debris';

interface P {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
  size: number; grow: number;
  r: number; g: number; b: number; a: number;
  gravity: number;
  drag: number;
}

/**
 * Pooled CPU particle system rendered as a single Points draw call per blend mode.
 * Soft round sprites generated in the shader (no textures).
 */
class Pool {
  readonly points: Points;
  private ps: P[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private cursor = 0;
  constructor(scene: Scene, private max: number, additive: boolean) {
    for (let i = 0; i < max; i++) this.ps.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, grow: 0, r: 1, g: 1, b: 1, a: 1, gravity: 0, drag: 0 });
    const g = new BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('color', new BufferAttribute(this.col, 4).setUsage(DynamicDrawUsage));
    g.setAttribute('size', new BufferAttribute(this.size, 1).setUsage(DynamicDrawUsage));
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uScale / max(0.5, -mv.z); }`,
      fragmentShader: `varying vec4 vC;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d) * 4.0; if (r > 1.0) discard; float a = vC.a * (1.0 - r) * (1.0 - r); gl_FragColor = vec4(vC.rgb, a); }`,
    });
    this.points = new Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 9 : 8;
    scene.add(this.points);
  }

  setScale(h: number) {
    (this.points.material as ShaderMaterial).uniforms.uScale.value = h * 0.9;
  }

  spawn(init: (p: P) => void) {
    // ring-buffer reuse: oldest particle is recycled when full
    const p = this.ps[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    p.alive = true;
    p.age = 0;
    p.gravity = 0;
    p.drag = 0;
    p.grow = 0;
    init(p);
  }

  update(dt: number) {
    let n = 0;
    for (const p of this.ps) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr;
      p.vz *= dr;
      p.vy = p.vy * dr - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.age / p.life;
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.col[n * 4] = p.r;
      this.col[n * 4 + 1] = p.g;
      this.col[n * 4 + 2] = p.b;
      this.col[n * 4 + 3] = p.a * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
      this.size[n] = p.size + p.grow * p.age;
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    (g.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as BufferAttribute).needsUpdate = true;
    (g.getAttribute('size') as BufferAttribute).needsUpdate = true;
  }
}

export class Particles {
  private soft: Pool;
  private glow: Pool;
  budget = 1;

  constructor(scene: Scene, max: number) {
    this.soft = new Pool(scene, max, false);
    this.glow = new Pool(scene, Math.round(max / 3), true);
  }

  setViewportHeight(h: number) {
    this.soft.setScale(h);
    this.glow.setScale(h);
  }

  emit(kind: ParticleKind, pos: Vector3, vel: Vector3, intensity = 1, color?: number) {
    if (Math.random() > this.budget) return;
    const rnd = (a: number) => (Math.random() - 0.5) * a;
    switch (kind) {
      case 'smoke':
        this.soft.spawn((p) => {
          p.x = pos.x + rnd(0.3); p.y = pos.y + 0.1; p.z = pos.z + rnd(0.3);
          p.vx = vel.x * 0.25 + rnd(1.2); p.vy = 0.6 + Math.random() * 0.8; p.vz = vel.z * 0.25 + rnd(1.2);
          p.life = 1.6 + Math.random() * 1.6 * intensity; p.size = 0.9; p.grow = 2.6;
          const c = 0.78 + Math.random() * 0.12;
          p.r = c; p.g = c; p.b = c * 1.02; p.a = 0.2 * intensity; p.drag = 1.2;
        });
        break;
      case 'dust': {
        const r = ((color ?? 0x9a8060) >> 16 & 255) / 255, g = ((color ?? 0x9a8060) >> 8 & 255) / 255, b = ((color ?? 0x9a8060) & 255) / 255;
        this.soft.spawn((p) => {
          p.x = pos.x + rnd(0.4); p.y = pos.y + 0.15; p.z = pos.z + rnd(0.4);
          p.vx = vel.x * 0.35 + rnd(2); p.vy = 0.5 + Math.random() * 1.2; p.vz = vel.z * 0.35 + rnd(2);
          p.life = 1.2 + Math.random() * 1.4; p.size = 0.8; p.grow = 2.2;
          p.r = r; p.g = g; p.b = b; p.a = 0.38 * intensity; p.drag = 1.5; p.gravity = 0.3;
        });
        break;
      }
      case 'spray':
        this.soft.spawn((p) => {
          p.x = pos.x + rnd(0.3); p.y = pos.y + 0.1; p.z = pos.z + rnd(0.3);
          p.vx = vel.x * 0.5 + rnd(1.5); p.vy = 0.8 + Math.random(); p.vz = vel.z * 0.5 + rnd(1.5);
          p.life = 0.6 + Math.random() * 0.5; p.size = 0.6; p.grow = 2.4;
          p.r = 0.8; p.g = 0.84; p.b = 0.9; p.a = 0.22 * intensity; p.drag = 2; p.gravity = 2;
        });
        break;
      case 'spark':
        this.glow.spawn((p) => {
          p.x = pos.x; p.y = pos.y; p.z = pos.z;
          p.vx = vel.x * 0.6 + rnd(6); p.vy = 1 + Math.random() * 4; p.vz = vel.z * 0.6 + rnd(6);
          p.life = 0.25 + Math.random() * 0.4; p.size = 0.12; p.grow = -0.1;
          p.r = 1.0; p.g = 0.7 + Math.random() * 0.3; p.b = 0.3; p.a = 1; p.gravity = 9.8; p.drag = 0.5;
        });
        break;
      case 'flame':
        this.glow.spawn((p) => {
          p.x = pos.x + rnd(0.05); p.y = pos.y + rnd(0.05); p.z = pos.z + rnd(0.05);
          p.vx = vel.x; p.vy = vel.y + rnd(0.3); p.vz = vel.z;
          p.life = 0.08 + Math.random() * 0.08; p.size = 0.32 * intensity; p.grow = 1.5;
          const blue = color === 1;
          p.r = blue ? 0.35 : 1; p.g = blue ? 0.6 : 0.55; p.b = blue ? 1 : 0.15; p.a = 0.9;
        });
        break;
      case 'debris':
        this.soft.spawn((p) => {
          p.x = pos.x; p.y = pos.y; p.z = pos.z;
          p.vx = vel.x * 0.5 + rnd(5); p.vy = 2 + Math.random() * 4; p.vz = vel.z * 0.5 + rnd(5);
          p.life = 1 + Math.random(); p.size = 0.18; p.grow = 0;
          p.r = 0.3; p.g = 0.3; p.b = 0.32; p.a = 1; p.gravity = 9.8;
        });
        break;
    }
  }

  update(dt: number) {
    this.soft.update(dt);
    this.glow.update(dt);
  }
}
