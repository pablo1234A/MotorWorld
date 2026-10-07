import * as THREE from 'three';

/**
 * Sky, sea, terrain and light rig. One `tod` value drives everything:
 *   0 = day, 1 = golden hour, 2 = night (fractions blend between presets).
 */

const C = (hex) => new THREE.Color(hex);

export const PRESETS = [
  { // day
    zenith: C('#2d6cb5'), horizon: C('#bcd9ee'), glow: C('#fff0d6'), glowAmt: 0.0,
    sunElev: 52, sunAzim: 215, sunColor: C('#fff1dc'), sunInt: 3.4,
    hemiSky: C('#bcd4ee'), hemiGround: C('#9b8e7a'), hemiInt: 0.85,
    fog: C('#c9dff0'), fogDensity: 0.0029, stars: 0, lamps: 0.12, env: 0.78, exposure: 0.9,
    seaDeep: C('#0a4f73'), seaShallow: C('#2f9fb0'),
  },
  { // golden hour
    zenith: C('#2d4f86'), horizon: C('#ffbe85'), glow: C('#ff8a4a'), glowAmt: 1.0,
    sunElev: 7, sunAzim: 232, sunColor: C('#ffa465'), sunInt: 3.0,
    hemiSky: C('#b5a9a2'), hemiGround: C('#7a5c48'), hemiInt: 0.74,
    fog: C('#f1b790'), fogDensity: 0.0052, stars: 0.0, lamps: 0.75, env: 0.62, exposure: 1.0,
    seaDeep: C('#1b3552'), seaShallow: C('#5b7d8d'),
  },
  { // night
    zenith: C('#03060f'), horizon: C('#1a2744'), glow: C('#3a4f86'), glowAmt: 0.25,
    sunElev: -20, sunAzim: 232, sunColor: C('#8fabe6'), sunInt: 0.0,
    hemiSky: C('#34487d'), hemiGround: C('#151a26'), hemiInt: 0.62,
    fog: C('#0f1a38'), fogDensity: 0.0044, stars: 1.0, lamps: 1.0, env: 0.5, exposure: 1.18,
    seaDeep: C('#040a16'), seaShallow: C('#0d1a2e'),
  },
];

const _tmpC = new THREE.Color();

function lerpPreset(tod) {
  const t = THREE.MathUtils.clamp(tod, 0, 2);
  const i = Math.min(1, Math.floor(t));
  const f = t - i;
  const a = PRESETS[i], b = PRESETS[i + 1];
  const out = {};
  for (const k of Object.keys(a)) {
    if (a[k].isColor) out[k] = a[k].clone().lerp(b[k], f);
    else out[k] = a[k] + (b[k] - a[k]) * f;
  }
  return out;
}

/* ------------------------------------------------------------------ sky */

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w; // pin to far plane
  }
`;

const SKY_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vDir;
  uniform vec3 uZenith, uHorizon, uGlow, uSunDir, uSunColor;
  uniform float uGlowAmt, uStars, uTime;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -0.2, 1.0);
    float t = pow(max(h, 0.0), 0.55);
    vec3 col = mix(uHorizon, uZenith, t);

    float sunAmt = max(dot(d, uSunDir), 0.0);
    // warm band hugging the horizon, strongest toward the sun
    float band = exp(-abs(d.y) * 7.0) * pow(sunAmt, 2.0);
    col += uGlow * band * (0.55 + uGlowAmt * 0.9);
    col += uGlow * pow(sunAmt, 12.0) * 0.35 * uGlowAmt;

    // sun disc + halo
    float disc = smoothstep(0.9992, 0.9998, sunAmt);
    col += uSunColor * disc * 4.0 * step(0.0, uSunDir.y + 0.02);
    col += uSunColor * pow(sunAmt, 90.0) * 0.55 * step(-0.05, uSunDir.y);

    // stars
    if (uStars > 0.01 && d.y > 0.0) {
      vec3 sp = floor(d * 380.0);
      float s = hash(sp);
      float star = smoothstep(0.9965, 1.0, s) * (0.55 + 0.45 * sin(uTime * 1.3 + s * 60.0));
      col += vec3(star) * uStars * smoothstep(0.0, 0.25, d.y);
    }

    // below horizon: fade to horizon so the sea seam disappears in the distance
    col = mix(col, uHorizon, smoothstep(0.0, -0.18, d.y));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Sky {
  constructor() {
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() }, uGlowAmt: { value: 0 }, uStars: { value: 0 },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }
  apply(p, sunDir) {
    const u = this.uniforms;
    u.uZenith.value.copy(p.zenith); u.uHorizon.value.copy(p.horizon);
    u.uGlow.value.copy(p.glow); u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(p.sunColor); u.uGlowAmt.value = p.glowAmt; u.uStars.value = p.stars;
  }
}

/* ------------------------------------------------------------------ sea */

const SEA_VERT = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SEA_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vWorld;
  uniform vec3 uDeep, uShallow, uHorizon, uSunDir, uSunColor, uFog, uCam;
  uniform float uTime, uFogDensity, uSky;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p){
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
    return s;
  }

  void main() {
    vec3 V = normalize(uCam - vWorld);
    vec2 p = vWorld.xz * 0.045;
    float e = 0.02;
    float t = uTime * 0.05;
    float n0 = fbm(p + vec2(t, t * 0.6));
    float nx = fbm(p + vec2(e, 0.0) + vec2(t, t * 0.6));
    float nz = fbm(p + vec2(0.0, e) + vec2(t, t * 0.6));
    vec3 N = normalize(vec3((n0 - nx) * 5.5, 1.0, (n0 - nz) * 5.5));

    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    float dist = length(uCam - vWorld);
    vec3 body = mix(uDeep, uShallow, smoothstep(0.35, 0.8, n0) * 0.5 * exp(-dist * 0.0009));
    vec3 col = mix(body, uHorizon, clamp(fres * 1.15, 0.0, 1.0));

    vec3 R = reflect(-V, N);
    float spec = pow(max(dot(R, uSunDir), 0.0), 140.0);
    col += uSunColor * spec * 3.2 * step(-0.02, uSunDir.y);
    col += uSunColor * pow(max(dot(R, uSunDir), 0.0), 12.0) * 0.12 * step(-0.02, uSunDir.y);

    float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist * 0.42);
    col = mix(col, uFog, clamp(f, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Sea {
  constructor(level = -16) {
    this.uniforms = {
      uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uFogDensity: { value: 0.004 }, uSky: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, fog: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = level;
  }
  apply(p, sunDir) {
    const u = this.uniforms;
    u.uDeep.value.copy(p.seaDeep); u.uShallow.value.copy(p.seaShallow);
    u.uHorizon.value.copy(p.horizon).lerp(p.zenith, 0.18);
    u.uSunDir.value.copy(sunDir); u.uSunColor.value.copy(p.sunColor);
    u.uFog.value.copy(p.fog); u.uFogDensity.value = p.fogDensity;
  }
}

/* ------------------------------------------------------------- terrain */

function vnoise(x, z, seed = 0) {
  const h = (i, j) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, seed) {
  let s = 0, a = 0.5;
  for (let i = 0; i < 5; i++) { s += a * vnoise(x, z, seed + i); x *= 2.04; z *= 2.04; a *= 0.5; }
  return s;
}
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Ground heightfield. The villa sits on a flat plateau around the origin; the
 * sea lies toward -z. `terrain` selects the coastline character.
 */
export function terrainHeight(x, z, cfg) {
  const { kind, seaLevel } = cfg;
  const plateau = -0.34;
  const hills = (fbm(x * 0.012 + 3, z * 0.012 + 9, cfg.seed) - 0.35) * 64;
  let h = plateau;

  // inland rise behind the villa (+z) and to the flanks
  const inland = smooth(34, 140, z) * (hills + 20) + smooth(70, 200, Math.abs(x)) * (hills + 14);
  h += Math.max(inland, 0);
  h += (fbm(x * 0.09, z * 0.09, cfg.seed + 4) - 0.5) * 0.6 * smooth(26, 60, Math.hypot(x, z * 0.8));

  if (kind === 'cliff') {
    const fall = smooth(-30, -50, z);
    h = THREE.MathUtils.lerp(h, seaLevel - 3 + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 6, fall);
  } else if (kind === 'beach') {
    const fall = smooth(-26, -78, z);
    h = THREE.MathUtils.lerp(h, seaLevel + 0.4, fall * fall * (3 - 2 * fall));
  } else if (kind === 'dunes') {
    h += (fbm(x * 0.03, z * 0.03, 11) - 0.45) * 7 * smooth(30, 80, Math.hypot(x, z));
    const fall = smooth(-34, -90, z);
    h = THREE.MathUtils.lerp(h, seaLevel + 0.3, fall);
  } else { // hills — estate on an elevated slope, sea far below
    const fall = smooth(-34, -120, z);
    h = THREE.MathUtils.lerp(h, seaLevel - 6 + (fbm(x * 0.02, z * 0.02, 5) - 0.5) * 18, fall);
  }
  return h;
}

export function buildTerrain(cfg) {
  const size = 900, seg = 260;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = C(cfg.grass), rock = C(cfg.rock), sand = C(cfg.sand), dry = C(cfg.dry);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z, cfg);
    pos.setY(i, h);
    const slope = Math.abs(terrainHeight(x + 1.5, z, cfg) - h) + Math.abs(terrainHeight(x, z + 1.5, cfg) - h);
    const patch = fbm(x * 0.05, z * 0.05, 8);
    col.copy(grass).lerp(dry, smooth(0.35, 0.7, patch));
    col.lerp(sand, smooth(cfg.seaLevel + 3, cfg.seaLevel + 0.4, h) * 1.0);
    if (cfg.kind === 'dunes') col.copy(sand).lerp(dry, patch * 0.5);
    col.lerp(rock, smooth(1.1, 2.6, slope));
    // keep the plateau close to the villa calm and paved-looking
    const near = 1 - smooth(18, 42, Math.hypot(x, z * 0.8));
    col.lerp(C(cfg.lawn), near * 0.55);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------------------------------------ light rig */

export class LightRig {
  constructor({ shadowSize = 2048 } = {}) {
    this.group = new THREE.Group();
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = shadowSize > 0;
    if (shadowSize > 0) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      const c = this.sun.shadow.camera;
      c.left = -48; c.right = 48; c.top = 48; c.bottom = -48; c.near = 1; c.far = 260;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.06;
    }
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 0.8);
    this.group.add(this.sun, this.sun.target, this.hemi);
    this.sunDir = new THREE.Vector3();
  }
  apply(p) {
    const el = THREE.MathUtils.degToRad(p.sunElev), az = THREE.MathUtils.degToRad(p.sunAzim);
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    // moon takes over for shadows once the sun is gone
    const dir = this.sunDir.clone();
    if (p.sunElev < 0) { dir.y = Math.abs(dir.y) * 0.9 + 0.35; dir.normalize(); }
    this.sun.position.copy(dir).multiplyScalar(140);
    this.sun.color.copy(p.sunColor);
    this.sun.intensity = p.sunInt + (p.sunElev < 0 ? 0.85 : 0);
    this.hemi.color.copy(p.hemiSky); this.hemi.groundColor.copy(p.hemiGround);
    this.hemi.intensity = p.hemiInt;
  }
}

export { lerpPreset };
