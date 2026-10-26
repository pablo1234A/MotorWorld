import { Color, DoubleSide, MeshStandardMaterial, type Texture } from 'three';
import { concreteTexture, detailTexture, facadeTextures, roadTexture } from './Textures';
import { ROAD_KINDS, type RoadKind } from './WorldDef';

/** Uniforms shared by every world material (weather + time of day). */
export const WU = {
  uWet: { value: 0 },
  uTime: { value: 0 },
  uNight: { value: 0 },
  uDetail: { value: null as Texture | null },
};

const WPOS_VERT = (shader: any) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
};

/**
 * Terrain: vertex colours (biomes) + world-space detail noise at two scales + rain wetness.
 */
export function terrainMaterial(): MeshStandardMaterial {
  WU.uDetail.value = detailTexture();
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uWet: WU.uWet, uDetail: WU.uDetail });
    WPOS_VERT(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uWet;\nuniform sampler2D uDetail;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 d1 = texture2D(uDetail, vWPos.xz * 0.21).rgb;
        vec3 d2 = texture2D(uDetail, vWPos.xz * 0.023).rgb;
        float det = mix(0.78, 1.18, d1.r) * mix(0.82, 1.14, d2.g) * mix(0.9, 1.08, d2.b);
        diffuseColor.rgb *= det;
        diffuseColor.rgb *= 1.0 - uWet * 0.32;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.55, uWet);`,
      );
  };
  return m;
}

const roadMats = new Map<string, MeshStandardMaterial>();

/** Road surface with rain puddles (low roughness patches that mirror the sky). */
export function roadMaterial(kind: RoadKind): MeshStandardMaterial {
  if (roadMats.has(kind)) return roadMats.get(kind)!;
  const info = ROAD_KINDS[kind];
  WU.uDetail.value = detailTexture();
  const m = new MeshStandardMaterial({
    map: roadTexture(kind, info.width, info.lanesPerDir, !!info.oneWay),
    roughness: kind === 'dirt' ? 0.95 : 0.82,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: kind === 'street' ? -2 : -4,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uWet: WU.uWet, uDetail: WU.uDetail });
    WPOS_VERT(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uWet;\nuniform sampler2D uDetail;\nfloat gPuddle;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 dd = texture2D(uDetail, vWPos.xz * 0.045).rgb;
        gPuddle = smoothstep(0.52, 0.66, dd.g * 0.7 + dd.b * 0.5) * uWet;
        diffuseColor.rgb *= 1.0 - uWet * ${kind === 'dirt' ? '0.38' : '0.45'} - gPuddle * 0.25;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, ${kind === 'dirt' ? '0.7' : '0.32'}, uWet);
        roughnessFactor = mix(roughnessFactor, 0.04, gPuddle);`,
      );
  };
  roadMats.set(kind, m);
  return m;
}

const facadeMats: MeshStandardMaterial[] = [];
export function facadeMaterial(style: number): MeshStandardMaterial {
  if (facadeMats[style]) return facadeMats[style];
  const { map, emissive } = facadeTextures(style);
  const m = new MeshStandardMaterial({
    map, emissiveMap: emissive, emissive: new Color(0xffffff), emissiveIntensity: 0,
    roughness: style === 0 ? 0.25 : 0.8, metalness: style === 0 ? 0.6 : 0.05, envMapIntensity: style === 0 ? 1.5 : 0.6,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uNight: WU.uNight, uWet: WU.uWet });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform float uWet;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uNight * 2.2;');
  };
  facadeMats[style] = m;
  return m;
}

let concreteMat: MeshStandardMaterial | null = null;
export function concreteMaterial(): MeshStandardMaterial {
  if (concreteMat) return concreteMat;
  concreteMat = new MeshStandardMaterial({ map: concreteTexture(), roughness: 0.88 });
  concreteMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uWet: WU.uWet });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 1.0 - uWet * 0.35;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.35, uWet);');
  };
  return concreteMat;
}

/** Plain vertex-coloured material for props (instanced or merged). */
const vcMats = new Map<string, MeshStandardMaterial>();
export function vcMaterial(rough = 0.8, metal = 0, doubleSide = false): MeshStandardMaterial {
  const k = `${rough}|${metal}|${doubleSide}`;
  if (vcMats.has(k)) return vcMats.get(k)!;
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, side: doubleSide ? DoubleSide : undefined });
  vcMats.set(k, m);
  return m;
}
