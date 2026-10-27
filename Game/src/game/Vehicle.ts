import { Mesh, MeshBasicMaterial, PlaneGeometry, Scene, SpotLight, Vector3, Object3D } from 'three';
import type { Assists } from '../physics/CarSpec';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { VehicleSim } from '../physics/VehicleSim';
import type { CarDef } from '../vehicles/CarCatalog';
import { CarModel } from '../vehicles/CarModel';
import { DEFAULT_TUNE, resolveSpec, type FineTune, type PartLevels, type VisualConfig } from '../vehicles/Tuning';
import { radialTexture } from '../world/Textures';

const _v = new Vector3();

/**
 * A drivable car: physics simulation + procedural model + lights + contact shadow.
 */
export class Vehicle {
  readonly sim: VehicleSim;
  model: CarModel;
  readonly shadow: Mesh;
  headlights: SpotLight[] = [];
  headOn = false;
  readonly id: string;
  /** -1 left, 0 off, 1 right */
  indicator = 0;
  hazard = false;
  /** current lamp state of the blinker (on/off phase) */
  blinkOn = false;
  private blinkT = 0;
  private turnArmed = false;

  constructor(
    public def: CarDef,
    public parts: PartLevels,
    public visual: VisualConfig,
    public tune: FineTune = DEFAULT_TUNE,
    world: PhysicsWorld,
    private scene: Scene,
    private quality: number,
    withLights: boolean,
    private live = withLights,
  ) {
    this.id = def.id;
    const spec = resolveSpec(def, parts, tune);
    this.sim = new VehicleSim(spec, world);
    this.model = this.makeModel();
    scene.add(this.model.root);
    this.shadow = new Mesh(
      new PlaneGeometry(def.body.width * 1.5, def.body.length * 1.25).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.75)'), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }),
    );
    this.shadow.renderOrder = 2;
    scene.add(this.shadow);
    if (withLights) {
      for (const sx of [-1, 1]) {
        const l = new SpotLight(0xfff2dd, 0, 90, 0.42, 0.45, 1.2);
        l.position.set(sx * def.body.width * 0.33, 0.7, -def.body.length * 0.48);
        const t = new Object3D();
        t.position.set(sx * def.body.width * 0.2, -0.2, -def.body.length * 0.5 - 20);
        this.model.root.add(t);
        l.target = t;
        this.model.root.add(l);
        this.headlights.push(l);
      }
    }
  }

  private makeModel(): CarModel {
    const m = new CarModel(this.def.body, this.visual, {
      quality: this.quality,
      interior: this.quality >= 1,
      wingLevel: this.parts.wing ?? 0,
      splitterLevel: this.parts.splitter ?? 0,
      diffuserLevel: this.parts.diffuser ?? 0,
      live: this.live,
    });
    const s = this.sim.spec;
    m.setPhysicsOffset(s.chassis.cgHeight, s.suspension.rideOffset, s.chassis.weightFront);
    return m;
  }

  /** Re-apply tuning (parts/visual changed). Keeps position. */
  rebuild(parts: PartLevels, visual: VisualConfig, tune: FineTune) {
    const structural = JSON.stringify([parts.wing, parts.splitter, parts.diffuser, visual.rimStyle, visual.rimSize, visual.frontBumper, visual.rearBumper, visual.skirts, visual.hood]) !==
      JSON.stringify([this.parts.wing, this.parts.splitter, this.parts.diffuser, this.visual.rimStyle, this.visual.rimSize, this.visual.frontBumper, this.visual.rearBumper, this.visual.skirts, this.visual.hood]);
    this.parts = parts;
    this.visual = visual;
    this.tune = tune;
    this.sim.setSpec(resolveSpec(this.def, parts, tune));
    if (structural) {
      const lights = this.headlights;
      this.scene.remove(this.model.root);
      this.model.dispose();
      this.model = this.makeModel();
      for (const l of lights) {
        this.model.root.add(l, l.target);
      }
      this.scene.add(this.model.root);
    } else {
      this.model.updateVisual(visual);
      const s = this.sim.spec;
      this.model.setPhysicsOffset(s.chassis.cgHeight, s.suspension.rideOffset, s.chassis.weightFront);
    }
  }

  /** Toggle an indicator like a stalk: pushing the same side again cancels it. */
  toggleIndicator(side: -1 | 1) {
    this.indicator = this.indicator === side ? 0 : side;
    this.turnArmed = false;
    if (this.indicator !== 0 && !this.hazard) this.blinkT = 0;
  }

  toggleHazard() {
    this.hazard = !this.hazard;
    this.blinkT = 0;
  }

  /**
   * Blink timing + self-cancelling: once the wheel has been turned towards the indicated side and comes back
   * to the centre, the indicator switches off (like a real steering column). Returns +1 / -1 on a relay click.
   */
  updateIndicators(dt: number, steer: number): number {
    if (this.indicator !== 0 && !this.hazard) {
      if (steer * this.indicator > 0.4) this.turnArmed = true;
      else if (this.turnArmed && Math.abs(steer) < 0.08) {
        this.indicator = 0;
        this.turnArmed = false;
      }
    }
    const active = this.hazard || this.indicator !== 0;
    if (!active) {
      const was = this.blinkOn;
      this.blinkOn = false;
      this.blinkT = 0;
      return was ? -1 : 0;
    }
    const prev = this.blinkOn;
    this.blinkT += dt;
    this.blinkOn = this.blinkT % 0.72 < 0.36;
    return this.blinkOn !== prev ? (this.blinkOn ? 1 : -1) : 0;
  }

  setAssists(a: Assists) {
    this.sim.assists = { ...a };
  }

  /** Sync visuals with physics (call once per rendered frame). */
  sync(night: number, alpha = 1) {
    const s = this.sim;
    const root = this.model.root;
    root.position.copy(s.position);
    root.quaternion.copy(s.quaternion);
    for (let i = 0; i < 4; i++) {
      const w = s.wheels[i];
      this.model.setWheel(i, w.mount.x, w.mount.y - w.length, w.mount.z, w.steer, w.spin);
    }
    this.model.setSteeringWheel(s.steerAngle);
    this.model.setGearLever(s.powertrain.gear, s.powertrain.shifting);
    const braking = s.input.brake > 0.05 && s.powertrain.gear > 0 ? s.input.brake : s.powertrain.gear < 0 && s.input.throttle > 0.05 ? 0.5 : 0;
    this.headOn = night > 0.35;
    this.model.setLights(this.headOn, braking, night, s.powertrain.gear < 0);
    const l = this.blinkOn && (this.hazard || this.indicator < 0), r = this.blinkOn && (this.hazard || this.indicator > 0);
    this.model.setIndicators(l, r);
    for (const l of this.headlights) l.intensity = this.headOn ? 260 : 0;
    // contact shadow follows the ground under the car
    const g = { height: 0, normal: _v, surface: 0 as any, water: 0 };
    s.world.sampleGround(s.position.x, s.position.z, s.position.y + 0.5, g);
    const h = s.position.y - g.height;
    this.shadow.position.set(s.position.x, g.height + 0.04, s.position.z);
    this.shadow.rotation.y = s.heading;
    (this.shadow.material as MeshBasicMaterial).opacity = 0.55 * Math.max(0, 1 - Math.max(0, h - s.spec.chassis.cgHeight) / 3);
    void alpha;
  }

  dispose() {
    this.scene.remove(this.model.root);
    this.scene.remove(this.shadow);
    this.model.dispose();
    this.shadow.geometry.dispose();
  }
}
