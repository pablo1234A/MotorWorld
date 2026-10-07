import * as THREE from 'three';
import { Sky, Sea, LightRig, buildTerrain, lerpPreset } from './environment.js';
import { buildVilla } from './villa.js';
import { SHOTS } from './shots.js';

/**
 * World = renderer + scene + one villa. Used by the live scroll tour on the home page
 * and by the offline render script that produces the gallery stills.
 */

export class World {
  constructor(canvas, params, opts = {}) {
    this.params = params;
    this.quality = opts.quality || 'high';          // 'high' | 'low'
    const low = this.quality === 'low';
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: !low, alpha: false, powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.preserve,
    });
    this.renderer.shadowMap.enabled = !low || !!opts.forceShadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.pixelRatioCap = opts.pixelRatio ?? (low ? 1.25 : 1.75);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 2400);
    this.time = 0;

    this.sky = new Sky();
    this.sea = new Sea(params.terrainCfg.seaLevel);
    this.rig = new LightRig({ shadowSize: this.renderer.shadowMap.enabled ? (low ? 1024 : 2048) : 0 });
    this.terrain = buildTerrain(params.terrainCfg);
    this.villa = buildVilla(params, { shadows: this.renderer.shadowMap.enabled, quality: this.quality });
    this.scene.add(this.sky.mesh, this.sea.mesh, this.terrain, this.rig.group, this.villa.group);
    this.scene.fog = new THREE.FogExp2(0xffffff, 0.004);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(this.sky.mesh.geometry, this.sky.mesh.material));
    this._envTod = null;
    this.tod = 0;
    this.setTimeOfDay(opts.tod ?? 0, true);
    this.resize(canvas.clientWidth || 1280, canvas.clientHeight || 720);
  }

  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.size = { w, h };
  }

  /** tod: 0 day · 1 golden hour · 2 night (fractional values blend). */
  setTimeOfDay(tod, forceEnv = false) {
    this.tod = tod;
    const p = lerpPreset(tod);
    this.rig.apply(p);
    this.sky.apply(p, this.rig.sunDir);
    this.sea.apply(p, this.rig.sunDir);
    this.scene.fog.color.copy(p.fog);
    this.scene.fog.density = p.fogDensity;
    this.renderer.toneMappingExposure = p.exposure;
    this.villa.kit.setLamps(p.lamps);
    this.scene.environmentIntensity = p.env;
    // IBL is rebuilt only when the light has moved enough to matter
    if (forceEnv || this._envTod === null || Math.abs(this._envTod - tod) > 0.12) {
      this._envTod = tod;
      const rt = this.pmrem.fromScene(this.envScene, 0.02, 1, 900);
      this.scene.environment?.dispose?.();
      this.envRT?.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
    }
  }

  /** Place the camera from a shot description {pos, look, fov}. */
  setCamera(pos, look, fov = 40, roll = 0) {
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    this.camera.lookAt(look[0], look[1], look[2]);
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  shot(name) {
    const s = SHOTS[name];
    if (!s) throw new Error(`Unknown shot ${name}`);
    this.setCamera(s.pos, s.look, s.fov);
    return s;
  }

  render(dt = 0) {
    this.time += dt;
    this.sky.uniforms.uTime.value = this.time;
    this.sea.uniforms.uTime.value = this.time;
    this.sea.uniforms.uCam.value.copy(this.camera.position);
    this.sky.mesh.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.envRT?.dispose();
    this.pmrem.dispose();
  }
}
