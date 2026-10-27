import {
  Color, DirectionalLight, FogExp2, HemisphereLight, PMREMGenerator, Scene, Texture, Vector3, WebGLRenderer, WebGLRenderTarget,
} from 'three';
import { clamp, damp, lerp, smoothstep } from '../core/MathUtil';
import { Sky } from './Sky';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm';

export const WEATHER_PRESETS: Record<WeatherKind, { cloud: number; rain: number; storm: number; fog: number }> = {
  clear: { cloud: 0.15, rain: 0, storm: 0, fog: 0.00028 },
  cloudy: { cloud: 0.7, rain: 0, storm: 0.15, fog: 0.00045 },
  rain: { cloud: 0.88, rain: 0.65, storm: 0.45, fog: 0.0009 },
  storm: { cloud: 1.0, rain: 1.0, storm: 0.85, fog: 0.0014 },
};

/**
 * Time of day + weather: drives sky, sun/moon light, hemisphere light, fog,
 * image-based lighting (PMREM of the sky) and exposure.
 */
export class Environment {
  readonly sky = new Sky();
  readonly sun = new DirectionalLight(0xffffff, 3);
  readonly hemi = new HemisphereLight(0xbcd4ff, 0x4a4030, 0.8);
  readonly fog = new FogExp2(0x9ab8d8, 0.0003);
  /** Hours 0..24 */
  time = 9.5;
  /** In-game hours per real second (default: 24 min full cycle). */
  timeScale = 24 / (24 * 60);
  paused = false;
  weather: WeatherKind = 'clear';
  /** Current (blended) weather parameters */
  cloud = 0.15;
  rain = 0;
  storm = 0;
  fogDensity = 0.00028;
  wetness = 0;
  night = 0;
  flash = 0;
  readonly sunDir = new Vector3();
  private pmrem: PMREMGenerator;
  private envRT: WebGLRenderTarget | null = null;
  private skyScene = new Scene();
  private lastEnvTime = -99;
  private lastEnvCloud = -1;
  envTexture: Texture | null = null;
  private lightningTimer = 5;
  onLightning?: (strength: number) => void;
  shadowSize = 90;

  constructor(private renderer: WebGLRenderer, private scene: Scene) {
    this.pmrem = new PMREMGenerator(renderer);
    scene.add(this.sky.mesh);
    scene.add(this.sun, this.sun.target, this.hemi);
    scene.fog = this.fog;
    const skyCopy = new Sky(100);
    skyCopy.mesh.material = this.sky.mesh.material;
    this.skyScene.add(skyCopy.mesh);
    this.sun.castShadow = true;
  }

  configureShadows(enabled: boolean, mapSize: number, extent: number) {
    this.sun.castShadow = enabled;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -extent;
    c.right = c.top = extent;
    c.near = 10;
    c.far = 600;
    c.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.shadowSize = extent;
    this.sun.shadow.map?.dispose();
    (this.sun.shadow as any).map = null;
  }

  setWeather(w: WeatherKind) {
    this.weather = w;
  }

  update(dt: number, focus: Vector3, quality: number) {
    if (!this.paused) this.time = (this.time + dt * this.timeScale) % 24;
    const target = WEATHER_PRESETS[this.weather];
    this.cloud = damp(this.cloud, target.cloud, 0.25, dt);
    this.rain = damp(this.rain, target.rain, 0.3, dt);
    this.storm = damp(this.storm, target.storm, 0.25, dt);
    this.fogDensity = damp(this.fogDensity, target.fog, 0.3, dt);
    // roads get wet quickly and dry slowly
    const wetTarget = this.rain > 0.1 ? 1 : 0;
    this.wetness = clamp(this.wetness + (wetTarget > this.wetness ? dt * 0.08 * (0.5 + this.rain) : -dt * 0.012), 0, 1);

    // sun path: rises east (+X), noon high to the south (+Z)
    const a = ((this.time - 6) / 24) * Math.PI * 2;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.38).normalize();
    const el = this.sunDir.y;
    const day = smoothstep(-0.1, 0.22, el);
    this.night = 1 - smoothstep(-0.12, 0.08, el);
    const s = this.sky.uniforms;
    s.uSun.value.copy(this.sunDir);
    s.uMoon.value.copy(this.sunDir).negate().add(new Vector3(0, 0.25, 0.3)).normalize();
    s.uTime.value += dt;
    s.uCloud.value = this.cloud;
    s.uStorm.value = this.storm;

    // lightning in storms
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.storm > 0.6) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 4 + Math.random() * 12;
        this.flash = 0.8 + Math.random() * 0.6;
        this.onLightning?.(this.flash);
      }
    }
    s.uFlash.value = this.flash * 0.35;

    // key light: sun by day, moon at night
    const moonUp = el < -0.05;
    const lightDir = moonUp ? s.uMoon.value : this.sunDir;
    const warm = smoothstep(0.0, 0.35, el);
    const sunCol = new Color().setRGB(1, lerp(0.55, 0.95, warm), lerp(0.3, 0.86, warm));
    const overcast = 1 - this.cloud * 0.65 - this.storm * 0.2;
    if (moonUp) {
      this.sun.color.setRGB(0.55, 0.65, 1.0);
      this.sun.intensity = 0.7 * (1 - this.cloud * 0.6);
    } else {
      this.sun.color.copy(sunCol);
      this.sun.intensity = 3.2 * smoothstep(-0.04, 0.2, el) * overcast + this.flash * 2;
    }
    this.sun.position.copy(focus).addScaledVector(lightDir, 300);
    this.sun.target.position.copy(focus);
    // snap shadow camera to texel grid to avoid shimmering
    this.sun.target.updateMatrixWorld();

    const skyTint = new Color().setRGB(lerp(0.09, 0.62, day), lerp(0.12, 0.74, day), lerp(0.22, 0.95, day));
    const grey = (skyTint.r + skyTint.g + skyTint.b) / 3;
    skyTint.lerp(new Color(grey, grey, grey), this.cloud * 0.5);
    this.hemi.color.copy(skyTint);
    this.hemi.groundColor.setRGB(lerp(0.03, 0.32, day), lerp(0.03, 0.27, day), lerp(0.04, 0.2, day));
    this.hemi.intensity = lerp(1.1, 1.0, day) + this.flash;

    // fog matches the horizon
    const fogCol = new Color().setRGB(lerp(0.035, 0.66, day), lerp(0.05, 0.76, day), lerp(0.1, 0.88, day));
    const dusk = 1 - smoothstep(0.0, 0.3, Math.abs(el));
    fogCol.lerp(new Color(0.95, 0.6, 0.4), dusk * 0.35 * (1 - this.cloud));
    const fg = (fogCol.r + fogCol.g + fogCol.b) / 3;
    fogCol.lerp(new Color(fg, fg, fg), this.cloud * 0.6);
    this.fog.color.copy(fogCol);
    this.fog.density = this.fogDensity;

    this.renderer.toneMappingExposure = lerp(1.7, 0.92, day) + this.flash * 0.3;

    // refresh image based lighting when the sky changed noticeably
    const interval = quality >= 2 ? 0.2 : 0.5;
    if (Math.abs(this.time - this.lastEnvTime) > interval || Math.abs(this.cloud - this.lastEnvCloud) > 0.08 || !this.envTexture) {
      this.lastEnvTime = this.time;
      this.lastEnvCloud = this.cloud;
      this.sky.uniforms.uSunDisc.value = 0.02;
      const rt = this.pmrem.fromScene(this.skyScene, 0, 0.1, 200);
      this.sky.uniforms.uSunDisc.value = 1;
      this.envRT?.dispose();
      this.envRT = rt;
      this.envTexture = rt.texture;
      this.scene.environment = rt.texture;
      this.scene.environmentIntensity = lerp(0.25, 1.0, day);
    }
  }

  /** Format time as HH:MM */
  get clock(): string {
    const h = Math.floor(this.time), m = Math.floor((this.time - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
}
