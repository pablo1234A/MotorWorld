import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, Vector2 } from 'three';
import { tileNoise } from './Textures';
import { WU } from './Materials';
import type { WorldData } from './WorldGen';
import { RIVER, SEA_LEVEL } from './WorldDef';

let normalTex: CanvasTexture | null = null;
function waterNormal(): CanvasTexture {
  if (normalTex) return normalTex;
  const S = 256;
  const n = tileNoise(S, 77, 5, 4);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const h = (xx: number, yy: number) => n[((yy + S) % S) * S + ((xx + S) % S)];
      const dx = (h(x + 1, y) - h(x - 1, y)) * 6;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 6;
      const i = (y * S + x) * 4;
      img.data[i] = 128 + dx * 127;
      img.data[i + 1] = 128 + dy * 127;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  normalTex = new CanvasTexture(c);
  normalTex.wrapS = normalTex.wrapT = RepeatWrapping;
  return normalTex;
}

/** Shared animated water material (sea + river): scrolling dual normal maps, fresnel via env map. */
export function waterMaterial(color = 0x0d3b4f): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: new Color(color), roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.88, normalMap: waterNormal(), normalScale: new Vector2(0.6, 0.6), envMapIntensity: 1.4 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = WU.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;')
      .replace(
        '#include <normal_fragment_maps>',
        `vec3 n1 = texture2D(normalMap, vWPos.xz * 0.03 + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
         vec3 n2 = texture2D(normalMap, vWPos.xz * 0.011 - vec2(uTime * 0.006, -uTime * 0.01)).xyz * 2.0 - 1.0;
         vec3 wn = normalize(vec3(-(n1.x + n2.x) * normalScale.x, 1.0, -(n1.y + n2.y) * normalScale.y));
         normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`,
      );
  };
  return m;
}

export function buildSea(): Mesh {
  const g = new PlaneGeometry(14000, 14000, 1, 1).rotateX(-Math.PI / 2);
  g.translate(0, SEA_LEVEL, 0);
  const m = new Mesh(g, waterMaterial());
  m.renderOrder = 1;
  return m;
}

export function buildRiver(w: WorldData): Mesh {
  const p = RIVER.pts;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const pts: [number, number][] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    const k = Math.ceil(L / 8);
    for (let s = 0; s < k; s++) pts.push([p[i][0] + ((p[i + 1][0] - p[i][0]) * s) / k, p[i][1] + ((p[i + 1][1] - p[i][1]) * s) / k]);
  }
  pts.push(p[p.length - 1]);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    const rx = -tz / l, rz = tx / l;
    const water = w.gen.river(pts[i][0], pts[i][1]).water;
    const hw = RIVER.width * 0.75;
    pos.push(pts[i][0] - rx * hw, water, pts[i][1] - rz * hw, pts[i][0] + rx * hw, water, pts[i][1] + rz * hw);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, i, 1, i);
  }
  const idx: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new Mesh(g, waterMaterial(0x1d4a45));
  m.renderOrder = 1;
  return m;
}
