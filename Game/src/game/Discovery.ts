import {
  AdditiveBlending, Color, CylinderGeometry, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Scene, ShaderMaterial, Vector3,
} from 'three';
import { L, t } from '../core/i18n';
import type { Profile } from '../progression/Profile';
import { EVENTS, type EventDef } from '../race/EventCatalog';
import { Route } from '../race/Route';
import type { World } from '../world/World';
import { POIS, ZONES, type PoiDef } from '../world/WorldDef';

export const EVENT_COLORS: Record<string, number> = {
  sprint: 0xe01a2b, circuit: 0xff7a1a, street: 0xd946ef, mountain: 0x22c55e, timetrial: 0x38bdf8, topspeed: 0xfacc15, drift: 0xa855f7, pursuit: 0x3b82f6, checkpoints: 0x14b8a6, special: 0xf2b631,
};
export const POI_COLORS: Record<string, number> = { garage: 0xe01a2b, gas: 0x60a5fa, viewpoint: 0xf2b631, speedtrap: 0xfacc15, driftzone: 0xa855f7, bonus: 0x22c55e, jump: 0xf97316 };

export interface Interaction {
  kind: 'event' | 'garage' | 'gas';
  id: string;
  label: string;
}

export interface EventStart {
  def: EventDef;
  x: number;
  y: number;
  z: number;
  heading: number;
}

/**
 * Exploration: zone/POI/event discovery, road exploration tracking, speed traps,
 * interaction prompts (garages, gas stations, event starts) and world beacons.
 */
export class Discovery {
  readonly starts: EventStart[] = [];
  private beacons: InstancedMesh;
  private beaconMat: ShaderMaterial;
  private trapCooldown = new Map<string, number>();
  private exploreAcc = 0;
  totalRoadCells = 0;
  currentZone: string | null = null;
  onToast?: (k: string, v: string, r?: string) => void;
  onViewpoint?: (p: PoiDef) => void;
  interaction: Interaction | null = null;
  inDriftZone = false;

  constructor(private world: World, private profile: Profile, scene: Scene) {
    for (const e of EVENTS) {
      const r = new Route(world.data.roads, e.legs, e.closed);
      const i = Math.min(r.n - 1, 4);
      this.starts.push({ def: e, x: r.x[i], y: r.y[i], z: r.z[i], heading: r.heading(i) });
      if (e.known) profile.discover('eventsFound', e.id);
    }
    for (const rd of world.data.roads.roads) this.totalRoadCells += Math.ceil(rd.length / 50);
    // beacons: event starts + POIs, one instanced draw call
    this.beaconMat = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vCol; varying float vY; varying float vF;
        void main(){ vCol = instanceColor; vY = position.y;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vF = abs(dot(n, normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; varying vec3 vCol; varying float vY; varying float vF;
        void main(){
          float a = pow(1.0 - vY, 2.2) * 0.42 * pow(vF, 2.5);
          a *= 0.8 + 0.2 * sin(uTime * 2.5 - vY * 18.0);
          gl_FragColor = vec4(vCol, a); }`,
    });
    const g = new CylinderGeometry(1, 1.15, 1, 24, 1, true).translate(0, 0.5, 0);
    const n = this.starts.length + POIS.length;
    this.beacons = new InstancedMesh(g, this.beaconMat, n);
    this.beacons.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.beacons.instanceMatrix.setUsage(DynamicDrawUsage);
    this.beacons.frustumCulled = false;
    this.beacons.renderOrder = 5;
    scene.add(this.beacons);
  }

  isKnown(id: string) {
    return this.profile.data.eventsFound.includes(id);
  }

  get explorePercent() {
    return Math.min(100, (this.profile.roadsExplored / this.totalRoadCells) * 100);
  }

  setVisible(v: boolean) {
    this.beacons.visible = v;
  }

  update(dt: number, px: number, py: number, pz: number, speed: number, inRace: boolean) {
    this.beaconMat.uniforms.uTime.value += dt;
    const m = new Matrix4();
    const q = new Quaternion();
    const c = new Color();
    let k = 0;
    const show = !inRace;
    for (const s of this.starts) {
      const known = this.isKnown(s.def.id);
      const d = Math.hypot(s.x - px, s.z - pz);
      if (!known && d < 90 && !inRace) {
        this.profile.discover('eventsFound', s.def.id);
        this.profile.addXp(150, 'discover');
        this.onToast?.(t('new_event'), L(s.def.name), '+150 XP');
      }
      const vis = show && known && d < 1400;
      const h = 38;
      m.compose(new Vector3(s.x, s.y - 1, s.z), q, vis ? new Vector3(3.2, h, 3.2) : new Vector3(0, 0, 0));
      this.beacons.setMatrixAt(k, m);
      this.beacons.setColorAt(k, c.setHex(EVENT_COLORS[s.def.type]));
      k++;
    }
    for (const p of POIS) {
      const d = Math.hypot(p.x - px, p.z - pz);
      const known = this.profile.data.pois.includes(p.id);
      const big = p.kind === 'garage' || p.kind === 'viewpoint';
      const vis = show && d < (big ? 1600 : 500) && (known || p.kind === 'garage') && p.kind !== 'speedtrap';
      const y = this.world.data.hm.heightAt(p.x, p.z);
      m.compose(new Vector3(p.x, y - 1, p.z), q, vis ? new Vector3(big ? 4 : 2.5, big ? 45 : 20, big ? 4 : 2.5) : new Vector3(0, 0, 0));
      this.beacons.setMatrixAt(k, m);
      this.beacons.setColorAt(k, c.setHex(POI_COLORS[p.kind] ?? 0xffffff));
      k++;
      // discovery
      if (!known && d < (p.kind === 'viewpoint' ? 45 : 60)) {
        this.profile.discover('pois', p.id);
        const xp = p.kind === 'viewpoint' ? 1000 : 250;
        this.profile.addXp(xp, 'discover');
        const kind = { garage: t('workshop'), gas: t('gas_station'), viewpoint: t('viewpoint'), speedtrap: t('speed_trap'), driftzone: t('drift_zone'), bonus: 'Bonus', jump: 'Jump' }[p.kind];
        this.onToast?.(t('new_poi') + ' · ' + kind, p.name ? L(p.name) : kind, `+${xp} XP`);
        if (p.kind === 'viewpoint') this.onViewpoint?.(p);
      }
      // speed traps
      if (p.kind === 'speedtrap' && d < 16 && speed > 15 && !inRace) {
        const cd = this.trapCooldown.get(p.id) ?? 0;
        if (performance.now() - cd > 8000) {
          this.trapCooldown.set(p.id, performance.now());
          const kmh = Math.round(speed * 3.6);
          const xp = Math.max(0, Math.round((kmh - 80) * 3));
          if (!known) this.profile.discover('pois', p.id);
          this.profile.addXp(xp, 'trap');
          this.onToast?.(t('speed_trap'), `${kmh} km/h`, xp ? `+${xp} XP` : undefined);
        }
      }
    }
    this.beacons.count = k;
    this.beacons.instanceMatrix.needsUpdate = true;
    if (this.beacons.instanceColor) this.beacons.instanceColor.needsUpdate = true;

    // zones
    let zone: string | null = null;
    for (const z of ZONES) if (Math.hypot(z.x - px, z.z - pz) < z.r) {
      zone = z.id;
      if (this.profile.discover('zones', z.id)) {
        this.profile.addXp(500, 'zone');
        this.onToast?.(t('new_zone'), L(z.name), '+500 XP');
      }
      break;
    }
    this.currentZone = zone;
    this.inDriftZone = POIS.some((p) => p.kind === 'driftzone' && Math.hypot(p.x - px, p.z - pz) < 160);

    // road exploration (cells of 50 m)
    this.exploreAcc += dt;
    if (this.exploreAcc > 0.5) {
      this.exploreAcc = 0;
      const h = this.world.data.roads.nearest(px, pz, 2);
      if (h && Math.abs(py - h.y) < 4) {
        if (this.profile.exploreRoad(`${h.road.index}:${Math.floor(h.s / 50)}`)) this.profile.addXp(15, 'explore');
      }
    }

    // interactions
    this.interaction = null;
    if (!inRace && speed < 9) {
      for (const s of this.starts) {
        if (this.isKnown(s.def.id) && Math.hypot(s.x - px, s.z - pz) < 22) {
          this.interaction = { kind: 'event', id: s.def.id, label: `${t('start_here')}: ${L(s.def.name)}` };
          break;
        }
      }
      if (!this.interaction)
        for (const p of POIS) {
          if ((p.kind === 'garage' || p.kind === 'gas') && Math.hypot(p.x - px, p.z - pz) < 26) {
            this.interaction = { kind: p.kind, id: p.id, label: p.kind === 'garage' ? t('enter_garage') : t('refuel') };
            break;
          }
        }
    }
  }

  zoneName(): string {
    const z = ZONES.find((zz) => zz.id === this.currentZone);
    return z ? L(z.name) : '';
  }
}
