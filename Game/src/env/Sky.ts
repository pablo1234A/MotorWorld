import { BackSide, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

/**
 * Procedural physically-inspired sky: gradient by sun elevation, sun & moon discs,
 * animated fbm cloud layer (coverage driven by weather) and stars at night.
 */
export class Sky {
  readonly mesh: Mesh;
  readonly uniforms = {
    uSun: { value: new Vector3(0, 1, 0) },
    uMoon: { value: new Vector3(0, -1, 0) },
    uTime: { value: 0 },
    uCloud: { value: 0.35 },
    uStorm: { value: 0 },
    uFlash: { value: 0 },
    uSunDisc: { value: 1 },
  };

  constructor(radius = 9000) {
    const mat = new ShaderMaterial({
      uniforms: this.uniforms,
      side: BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform vec3 uMoon; uniform float uTime; uniform float uCloud; uniform float uStorm; uniform float uFlash; uniform float uSunDisc;
        varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*noise(p); p *= 2.03; a *= 0.5; } return s; }
        void main() {
          vec3 d = normalize(vDir);
          float el = uSun.y;
          float day = smoothstep(-0.12, 0.25, el);
          float dusk = (1.0 - smoothstep(0.0, 0.35, abs(el))) ;
          vec3 zenDay = vec3(0.16, 0.38, 0.78), horDay = vec3(0.62, 0.78, 0.94);
          vec3 zenNight = vec3(0.005, 0.01, 0.03), horNight = vec3(0.03, 0.05, 0.1);
          vec3 zen = mix(zenNight, zenDay, day);
          vec3 hor = mix(horNight, horDay, day);
          float sunAz = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0);
          hor = mix(hor, vec3(1.0, 0.5, 0.22), dusk * pow(sunAz, 3.0) * 0.85);
          zen = mix(zen, vec3(0.22, 0.24, 0.42), dusk * 0.4);
          float h = max(d.y, 0.0);
          vec3 col = mix(hor, zen, pow(h, 0.55));
          // below horizon: hazy ground colour
          col = mix(col, hor * 0.7, smoothstep(0.0, -0.08, d.y));
          // storm desaturation
          vec3 grey = vec3(dot(col, vec3(0.3, 0.55, 0.15)));
          col = mix(col, grey * 0.65, uStorm * 0.8);
          float mu = max(dot(d, uSun), 0.0);
          vec3 sunCol = mix(vec3(1.0, 0.45, 0.15), vec3(1.0, 0.96, 0.88), smoothstep(0.0, 0.3, el));
          col += sunCol * pow(mu, 6.0) * 0.28 * (1.0 - uStorm) * smoothstep(-0.1, 0.05, el);
          col += sunCol * pow(mu, 1200.0) * 40.0 * uSunDisc * (1.0 - uCloud * 0.7) * smoothstep(-0.02, 0.02, el);
          // moon
          float mm = max(dot(d, uMoon), 0.0);
          col += vec3(0.75, 0.8, 0.95) * smoothstep(0.9993, 0.9996, mm) * (1.0 - day) * (1.0 - uCloud);
          col += vec3(0.2, 0.25, 0.4) * pow(mm, 60.0) * 0.25 * (1.0 - day);
          // stars
          if (d.y > 0.0) {
            vec2 sp = d.xz / (d.y + 0.3) * 160.0;
            float st = step(0.9975, hash(floor(sp))) * (0.5 + 0.5 * sin(uTime * 3.0 + hash(floor(sp)) * 40.0));
            col += vec3(st) * (1.0 - day) * (1.0 - uCloud) * smoothstep(0.0, 0.2, d.y);
          }
          // clouds
          if (d.y > 0.0) {
            vec2 cp = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
            float n = fbm(cp);
            float cov = mix(0.62, 0.25, uCloud);
            float c = smoothstep(cov, cov + 0.25, n) * smoothstep(0.0, 0.12, d.y);
            vec3 lit = mix(vec3(0.05, 0.06, 0.08), mix(vec3(1.0, 0.62, 0.42), vec3(1.0), smoothstep(0.0, 0.3, el)), day);
            vec3 shade = mix(lit, lit * 0.45, smoothstep(cov + 0.1, cov + 0.4, n));
            shade = mix(shade, shade * 0.4, uStorm);
            shade += pow(mu, 4.0) * sunCol * 0.25 * day * (1.0 - uStorm);
            col = mix(col, shade, c * 0.95);
          }
          col += vec3(0.8, 0.85, 1.0) * uFlash;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(new SphereGeometry(radius, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }
}
