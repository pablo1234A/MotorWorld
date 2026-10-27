import {
  Color, DoubleSide, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, Quaternion, Scene, Shape, ShapeGeometry, Vector3, WebGLRenderer, WebGLRenderTarget,
} from 'three';
import type { Vehicle } from '../game/Vehicle';

const _v = new Vector3();
const _d = new Vector3();
const _q = new Quaternion();

/**
 * Rear-view mirrors drawn at the sides of the screen. Each side mirror is a real camera at the car's mirror,
 * looking back and slightly outwards, rendered into a small texture (alternating sides each frame on lower
 * quality levels) and shown horizontally flipped, like a mirror.
 */
export class Mirrors {
  enabled = true;
  private cams: PerspectiveCamera[] = [];
  private rts: WebGLRenderTarget[] = [];
  private overlay = new Scene();
  private ortho = new OrthographicCamera(0, 1, 1, 0, -1, 1);
  private glassMeshes: Mesh[] = [];
  private frameMeshes: Mesh[] = [];
  private frame = 0;
  private w = 1;
  private h = 1;

  constructor(private renderer: WebGLRenderer, private scene: Scene, readonly quality: number) {
    const rw = quality >= 2 ? 384 : 256, rh = Math.round(rw * 0.5);
    for (let i = 0; i < 2; i++) {
      const rt = new WebGLRenderTarget(rw, rh, { samples: quality >= 2 ? 4 : 0 });
      // a mirror shows the scene flipped left-right
      rt.texture.repeat.set(-1, 1);
      rt.texture.offset.set(1, 0);
      this.rts.push(rt);
      const cam = new PerspectiveCamera(26, rw / rh, 0.25, quality >= 2 ? 320 : 200);
      this.cams.push(cam);
      // the right-hand mirror is the left one reflected (its picture is not)
      const glass = new Mesh(mirrorShape(0, i === 1), new MeshBasicMaterial({ map: rt.texture, toneMapped: true, side: DoubleSide }));
      const frame = new Mesh(mirrorShape(0.035, i === 1), new MeshBasicMaterial({ color: new Color(0x0c0d10), toneMapped: false, side: DoubleSide }));
      frame.renderOrder = 0;
      glass.renderOrder = 1;
      this.overlay.add(frame, glass);
      this.glassMeshes.push(glass);
      this.frameMeshes.push(frame);
    }
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.ortho.left = 0;
    this.ortho.right = w;
    this.ortho.top = h;
    this.ortho.bottom = 0;
    this.ortho.updateProjectionMatrix();
    const mw = Math.min(w * 0.2, 300), mh = mw * 0.5;
    const portrait = h > w;
    const y = portrait ? h * 0.66 : h * 0.6;
    for (let i = 0; i < 2; i++) {
      const left = i === 0;
      const x = left ? 12 + mw / 2 : w - 12 - mw / 2;
      for (const m of [this.glassMeshes[i], this.frameMeshes[i]]) {
        m.position.set(x, y, 0);
        m.scale.set(mw, mh, 1);
      }
    }
  }

  /** Render the two mirror views from the player's car. */
  update(v: Vehicle) {
    if (!this.enabled) return;
    const s = v.sim;
    const m = v.model;
    this.frame++;
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false; // reuse this frame's shadow map
    for (let i = 0; i < 2; i++) {
      // low quality: refresh one side per frame
      if (this.quality < 2 && this.frame % 2 !== i) continue;
      const sx = i === 0 ? -1 : 1;
      const cam = this.cams[i];
      _v.set(m.mirrorPos.x * sx + sx * 0.04, m.mirrorPos.y + 0.02, m.mirrorPos.z).add(m.bodyGroup.position);
      _v.applyQuaternion(s.quaternion).add(s.position);
      cam.position.copy(_v);
      // look backwards (+z in car space) and a little outwards / down
      _d.set(sx * 0.2, -0.05, 1).normalize().applyQuaternion(s.quaternion);
      cam.up.set(0, 1, 0).applyQuaternion(_q.copy(s.quaternion));
      cam.lookAt(_v.add(_d));
      r.setRenderTarget(this.rts[i]);
      r.render(this.scene, cam);
    }
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = prevShadow;
  }

  /** Draw the mirrors over the frame (call after the main render). */
  draw() {
    if (!this.enabled) return;
    const r = this.renderer;
    const ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.overlay, this.ortho);
    r.autoClear = ac;
  }

  dispose() {
    for (const rt of this.rts) rt.dispose();
  }
}

/** Door-mirror outline in a unit box centred at the origin (x: -0.5..0.5, y: -0.5..0.5), grown by `grow`. */
function mirrorShape(grow: number, flip: boolean): ShapeGeometry {
  const g = grow;
  const s = new Shape();
  // slightly trapezoidal with a rounded outer edge
  s.moveTo(-0.5 - g, -0.36 - g);
  s.lineTo(0.3, -0.5 - g);
  s.quadraticCurveTo(0.5 + g, -0.5 - g, 0.5 + g, -0.18);
  s.lineTo(0.5 + g, 0.2);
  s.quadraticCurveTo(0.5 + g, 0.5 + g, 0.22, 0.5 + g);
  s.lineTo(-0.38, 0.42 + g);
  s.quadraticCurveTo(-0.5 - g, 0.4 + g, -0.5 - g, 0.22);
  s.closePath();
  const geo = new ShapeGeometry(s, 8);
  // uv from the unit box so the texture fills the glass
  const pos = geo.getAttribute('position'), uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    if (flip) pos.setX(i, -pos.getX(i));
    uv.setXY(i, pos.getX(i) + 0.5, pos.getY(i) + 0.5);
  }
  return geo;
}
