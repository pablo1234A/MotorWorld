import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Camera, DynamicDrawUsage, LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, ShaderMaterial, Vector3,
} from 'three';

/**
 * Skid marks: ring buffer of quads laid on the ground behind sliding wheels.
 */
export class SkidMarks {
  readonly mesh: Mesh;
  private pos: Float32Array;
  private alpha: Float32Array;
  private quad = 0;
  private last: (Vector3 | null)[] = [null, null, null, null];
  private lastW: number[] = [0, 0, 0, 0];

  constructor(scene: Scene, private max = 1600) {
    const g = new BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3);
    this.alpha = new Float32Array(max * 4);
    const idx: number[] = [];
    for (let q = 0; q < max; q++) {
      const a = q * 4;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('alpha', new BufferAttribute(this.alpha, 1).setUsage(DynamicDrawUsage));
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -10,
      polygonOffsetUnits: -10,
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.03,0.03,0.035, vA); }`,
    });
    this.mesh = new Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  /** Add a segment for wheel i. intensity 0 ends the trail. */
  add(i: number, p: Vector3, rightX: number, rightZ: number, width: number, intensity: number) {
    if (intensity <= 0.05) {
      this.last[i] = null;
      return;
    }
    const prev = this.last[i];
    if (!prev) {
      this.last[i] = p.clone();
      this.lastW[i] = intensity;
      return;
    }
    if (prev.distanceToSquared(p) < 0.25) return;
    const hw = width / 2;
    const q = this.quad;
    const o = q * 12;
    const set = (k: number, x: number, y: number, z: number) => {
      this.pos[o + k * 3] = x;
      this.pos[o + k * 3 + 1] = y + 0.03;
      this.pos[o + k * 3 + 2] = z;
    };
    set(0, prev.x - rightX * hw, prev.y, prev.z - rightZ * hw);
    set(1, prev.x + rightX * hw, prev.y, prev.z + rightZ * hw);
    set(2, p.x - rightX * hw, p.y, p.z - rightZ * hw);
    set(3, p.x + rightX * hw, p.y, p.z + rightZ * hw);
    const a0 = Math.min(0.75, this.lastW[i] * 0.75), a1 = Math.min(0.75, intensity * 0.75);
    this.alpha.set([a0, a0, a1, a1], q * 4);
    this.quad = (q + 1) % this.max;
    prev.copy(p);
    this.lastW[i] = intensity;
    const g = this.mesh.geometry;
    (g.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (g.getAttribute('alpha') as BufferAttribute).needsUpdate = true;
  }

  break() {
    this.last = [null, null, null, null];
  }
}

/**
 * GPU rain: streaks animated entirely in the vertex shader around the camera.
 */
export class Rain {
  readonly lines: LineSegments;
  private mat: ShaderMaterial;
  constructor(scene: Scene, count: number) {
    const g = new BufferGeometry();
    const seed = new Float32Array(count * 2 * 3);
    const end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const s = [Math.random(), Math.random(), Math.random()];
      seed.set(s, i * 6);
      seed.set(s, i * 6 + 3);
      end[i * 2 + 1] = 1;
    }
    g.setAttribute('position', new BufferAttribute(seed, 3));
    g.setAttribute('endp', new BufferAttribute(end, 1));
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new Vector3() }, uWind: { value: new Vector3(1.5, 0, 0.8) }, uAmount: { value: 0 }, uLight: { value: 1 } },
      vertexShader: `uniform float uTime; uniform vec3 uCam; uniform vec3 uWind; attribute float endp; varying float vA; uniform float uAmount;
        void main(){
          vec3 box = vec3(60.0, 36.0, 60.0);
          vec3 vel = vec3(uWind.x, -24.0, uWind.z);
          vec3 p = position * box + vel * uTime * 0.04 * 25.0;
          p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
          p += normalize(vel) * endp * 0.9;
          vA = step(position.x, uAmount) * (0.25 + 0.2 * endp);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `varying float vA; uniform float uLight; void main(){ if (vA <= 0.001) discard; gl_FragColor = vec4(vec3(0.75,0.8,0.88) * uLight, vA); }`,
    });
    this.lines = new LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    scene.add(this.lines);
  }
  update(dt: number, cam: Camera, amount: number, light: number) {
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uCam.value.copy(cam.position);
    this.mat.uniforms.uAmount.value = amount;
    this.mat.uniforms.uLight.value = light;
    this.lines.visible = amount > 0.01;
  }
}

/**
 * Screen-space speed streaks overlay (nitro / very high speed). One quad, NDC space.
 */
export class SpeedLines {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  constructor(scene: Scene) {
    this.mat = new ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new Vector3(1, 1, 1) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uAmount; uniform vec3 uColor; varying vec2 vUv;
        float hash(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          vec2 c = vUv - 0.5; float r = length(c); float a = atan(c.y, c.x);
          float lane = floor(a * 60.0); float h = hash(lane);
          float streak = step(0.82, h) * smoothstep(0.3, 0.75, r) * fract(r * 3.0 - uTime * (2.0 + h * 3.0) + h);
          streak = pow(streak, 6.0);
          gl_FragColor = vec4(uColor, streak * uAmount * 0.5);
        }`,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 999;
    scene.add(this.mesh);
  }
  update(dt: number, amount: number, nitro: boolean) {
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uAmount.value += (amount - this.mat.uniforms.uAmount.value) * Math.min(1, dt * 4);
    this.mat.uniforms.uColor.value.set(nitro ? 0.5 : 1, nitro ? 0.8 : 1, 1);
    this.mesh.visible = this.mat.uniforms.uAmount.value > 0.01;
  }
}

export function flashMaterial() {
  return new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false });
}
