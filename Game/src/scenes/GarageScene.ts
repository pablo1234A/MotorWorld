import {
  CircleGeometry, Color, CylinderGeometry, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PMREMGenerator, PlaneGeometry,
  RingGeometry, Scene, SpotLight, Texture, Vector3, WebGLRenderer, BoxGeometry, AdditiveBlending,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp, damp } from '../core/MathUtil';
import type { CarDef } from '../vehicles/CarCatalog';
import { CarModel } from '../vehicles/CarModel';
import { resolveSpec, type PartLevels, type VisualConfig } from '../vehicles/Tuning';
import { radialTexture } from '../world/Textures';

/**
 * Showroom for the garage and dealership: turntable, studio lighting, glossy floor,
 * orbit camera with drag/pinch, car model that updates live with tuning.
 */
export class GarageScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(36, 1, 0.1, 200);
  private turntable = new Group();
  private model: CarModel | null = null;
  private key = '';
  private yaw = 0.7;
  private pitch = 0.18;
  private dist = 8.5;
  private targetYaw = 0.7;
  private targetDist = 8.5;
  private dragging = false;
  autoRotate = true;
  private env: Texture;
  /** Focus offset: shift car left when a side panel covers the right of the screen. */
  offsetX = 0;
  private portrait = 0;
  private ring: Mesh;

  constructor(renderer: WebGLRenderer, private quality: number) {
    const s = this.scene;
    s.background = new Color(0x0b0b0e);
    s.fog = new Fog(0x0b0b0e, 18, 42);
    const pm = new PMREMGenerator(renderer);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environment = this.env;
    s.environmentIntensity = 0.65;
    s.add(new HemisphereLight(0xb8c4d8, 0x16120f, 0.5));
    const key = new SpotLight(0xffffff, 140, 40, 0.55, 0.6, 1.6);
    key.position.set(4, 9, 5);
    key.castShadow = quality >= 1;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0003;
    s.add(key, key.target);
    const rim = new SpotLight(0xff3446, 70, 30, 0.7, 0.8, 1.5);
    rim.position.set(-6, 3, -6);
    s.add(rim, rim.target);
    const fill = new DirectionalLight(0x9db8ff, 0.7);
    fill.position.set(-5, 4, 6);
    s.add(fill);
    // floor: glossy dark with radial light pool
    const floor = new Mesh(new CircleGeometry(30, 64).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0x0e0e11, roughness: 0.5, metalness: 0.15, envMapIntensity: 0.35 }));
    floor.receiveShadow = true;
    s.add(floor);
    const pool = new Mesh(new PlaneGeometry(12, 12).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: radialTexture('rgba(255,255,255,0.22)', 'rgba(255,255,255,0.05)'), transparent: true, depthWrite: false, blending: AdditiveBlending }));
    pool.position.y = 0.005;
    s.add(pool);
    // turntable
    const plate = new Mesh(new CylinderGeometry(3.4, 3.5, 0.08, 64), new MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.4, metalness: 0.7 }));
    plate.position.y = 0.04;
    plate.receiveShadow = true;
    this.turntable.add(plate);
    this.ring = new Mesh(new RingGeometry(3.42, 3.5, 96).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xe01a2b }));
    this.ring.position.y = 0.085;
    this.turntable.add(this.ring);
    s.add(this.turntable);
    // backdrop light strips
    for (let k = -3; k <= 3; k++) {
      const strip = new Mesh(new BoxGeometry(0.08, 6, 0.08), new MeshBasicMaterial({ color: k === 0 ? 0xe01a2b : 0x3a3a44 }));
      const a = (k / 7) * Math.PI * 0.9 + Math.PI;
      strip.position.set(Math.sin(a) * 16, 3, Math.cos(a) * 16);
      s.add(strip);
    }
  }

  bindInput(el: HTMLElement) {
    let lastX = 0, lastY = 0;
    const pts = new Map<number, [number, number]>();
    let pinch = 0;
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement) !== el) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      lastX = e.clientX;
      lastY = e.clientY;
      this.dragging = true;
      this.autoRotate = false;
    });
    addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.targetDist = clamp(this.targetDist * (pinch / d), 4.5, 14);
        pinch = d;
        return;
      }
      this.targetYaw -= (e.clientX - lastX) * 0.008;
      this.pitch = clamp(this.pitch + (e.clientY - lastY) * 0.004, 0.02, 0.7);
      lastX = e.clientX;
      lastY = e.clientY;
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
      if (!pts.size) this.dragging = false;
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      this.targetDist = clamp(this.targetDist + e.deltaY * 0.01, 4.5, 14);
    });
  }

  /** Show a car; rebuilds the model only when structural options change. */
  setCar(def: CarDef, visual: VisualConfig, parts: PartLevels) {
    const key = JSON.stringify([def.id, parts.wing, parts.splitter, parts.diffuser, visual.rimStyle, visual.rimSize, visual.frontBumper, visual.rearBumper, visual.skirts, visual.hood]);
    if (key !== this.key || !this.model) {
      if (this.model) {
        this.turntable.remove(this.model.root);
        this.model.dispose();
      }
      this.key = key;
      this.model = new CarModel(def.body, visual, { quality: Math.max(2, this.quality), interior: true, wingLevel: parts.wing ?? 0, splitterLevel: parts.splitter ?? 0, diffuserLevel: parts.diffuser ?? 0 });
      this.model.root.traverse((o) => {
        if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
      });
      this.turntable.add(this.model.root);
      this.targetDist = 6.5 + def.body.length * 1.05;
    } else this.model.updateVisual(visual);
    // ride height from tuning
    const spec = resolveSpec(def, parts);
    this.model.root.position.y = 0;
    this.model.bodyGroup.position.set(0, spec.suspension.rideOffset, 0);
    for (const w of this.model.wheels) w.root.position.y = def.body.wheelRadius - spec.suspension.rideOffset;
    this.model.setLights(true, 0, 0);
    this.update(0);
  }

  get car() {
    return this.model;
  }

  resize(w: number, hgt: number) {
    const c = this.camera;
    c.aspect = w / hgt;
    // portrait: the panels fill the lower half, so frame the car in the upper part of the screen
    // (render the lower window of a taller virtual frame) with a wider lens so the whole car fits
    this.portrait = clamp((1 - c.aspect) / 0.5, 0, 1);
    if (this.portrait > 0) {
      const extra = 0.5 * this.portrait;
      c.fov = 36 + 14 * this.portrait;
      c.setViewOffset(w, hgt * (1 + extra), 0, hgt * extra, w, hgt);
    } else {
      c.fov = 36;
      c.clearViewOffset();
    }
    c.updateProjectionMatrix();
  }

  update(dt: number) {
    if (this.autoRotate) this.targetYaw += dt * 0.18;
    this.yaw = damp(this.yaw, this.targetYaw, 6, dt);
    this.dist = damp(this.dist, this.targetDist, 5, dt);
    const c = this.camera;
    const target = new Vector3(this.offsetX * this.dist * 0.18 * (1 - this.portrait), 0.6, 0);
    // narrow portrait screens need the camera further back for the whole car to fit across
    const dist = this.dist * (1 + 0.6 * this.portrait);
    c.position.set(target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * dist, 0.6 + Math.sin(this.pitch) * dist, Math.cos(this.yaw) * Math.cos(this.pitch) * dist);
    c.lookAt(target);
    (this.ring.material as MeshBasicMaterial).color.setHSL(0.99, 0.8, 0.45 + Math.sin(performance.now() * 0.002) * 0.05);
  }
}
