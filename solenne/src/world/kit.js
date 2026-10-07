import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { grainTexture, woodTexture, slabTexture, blobTexture } from './textures.js';

/**
 * Shared building kit: material library, mesh helpers and the lamp registry that
 * lets the time-of-day control switch every interior light at once.
 */

export class Kit {
  constructor(params, { shadows = true } = {}) {
    this.params = params;
    this.shadows = shadows;
    this.lamps = { emissive: [], lights: [] };
    this.blob = blobTexture();
    this.blobMat = new THREE.MeshBasicMaterial({ map: this.blob, transparent: true, depthWrite: false, opacity: 0.5, color: 0x000000 });
    this.mats = this.makeMaterials(params);
    this.geoCache = new Map();
  }

  makeMaterials(p) {
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const wall = grainTexture({ base: p.wall, variance: 10, seed: 3, repeat: 5 });
    const concrete = grainTexture({ base: p.concrete, variance: 18, seed: 9, repeat: 4 });
    const timber = woodTexture({ base: p.timber, dark: p.timberDark, seed: 4, repeat: 1 });
    const timberV = woodTexture({ base: p.timber, dark: p.timberDark, seed: 6, repeat: 1 });
    timberV.rotation = Math.PI / 2;
    const floorIn = slabTexture({ base: p.floor, seed: 2, cells: 3, repeat: 5 });
    const terrace = slabTexture({ base: p.terrace, seed: 5, cells: 3, repeat: 8 });
    const oak = woodTexture({ base: p.oak, dark: p.timberDark, seed: 8, boards: 9, repeat: 4 });

    const m = {
      wall: std({ map: wall, roughness: 0.92 }),
      concrete: std({ map: concrete, roughness: 0.88 }),
      timber: std({ map: timber, roughness: 0.62 }),
      timberV: std({ map: timberV, roughness: 0.62 }),
      oak: std({ map: oak, roughness: 0.55 }),
      floorIn: std({ map: floorIn, roughness: 0.38 }),
      terrace: std({ map: terrace, roughness: 0.78 }),
      stone: std({ color: p.stoneDark, roughness: 0.5, metalness: 0.02 }),
      frame: std({ color: 0x1a1918, roughness: 0.42, metalness: 0.85 }),
      brass: std({ color: 0xb08d57, roughness: 0.3, metalness: 1 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0xb7cbd0, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6, ior: 1.5,
      }),
      linen: std({ color: p.linen, roughness: 0.96 }),
      boucle: std({ color: 0xeee7da, roughness: 1 }),
      charcoal: std({ color: 0x2c2b2a, roughness: 0.9 }),
      accent: std({ color: p.accent, roughness: 0.85 }),
      white: std({ color: 0xf3f0ea, roughness: 0.6 }),
      leaf: std({ color: p.leaf, roughness: 0.85 }),
      leafDark: std({ color: p.leafDark, roughness: 0.85 }),
      bark: std({ color: 0x6b5c49, roughness: 1 }),
      water: new THREE.MeshPhysicalMaterial({
        color: p.water, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.9,
        envMapIntensity: 1.6, emissive: new THREE.Color(p.waterGlow), emissiveIntensity: 0,
      }),
      basin: std({ color: p.waterBottom, roughness: 0.6, emissive: new THREE.Color(p.waterGlow), emissiveIntensity: 0 }),
    };
    this.lampEmissive(m.water, 0.55);
    this.lampEmissive(m.basin, 0.9);
    return m;
  }

  /** Register a material whose emissiveIntensity follows the lamp level. */
  lampEmissive(mat, base) { this.lamps.emissive.push({ mat, base }); return mat; }

  glowMaterial(color = 0xffd9a3, base = 2.4) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2520, emissive: new THREE.Color(color), emissiveIntensity: 0, roughness: 0.6 });
    return this.lampEmissive(mat, base);
  }

  pointLight(x, y, z, { color = 0xffd2a0, base = 30, distance = 14 } = {}, parent) {
    const l = new THREE.PointLight(color, 0, distance, 2);
    l.position.set(x, y, z);
    parent.add(l);
    this.lamps.lights.push({ light: l, base });
    return l;
  }

  setLamps(level) {
    for (const { mat, base } of this.lamps.emissive) mat.emissiveIntensity = base * level;
    for (const { light, base } of this.lamps.lights) light.intensity = base * level;
  }

  /* -------------------------------------------------------------- meshes */

  box(parent, w, h, d, mat, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
    const key = `b${w}|${h}|${d}`;
    let g = this.geoCache.get(key);
    if (!g) { g = new THREE.BoxGeometry(w, h, d); this.geoCache.set(key, g); }
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.castShadow = cast && this.shadows;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  }

  /** Box addressed by min/max corners — easier for walls and slabs. */
  span(parent, x0, x1, y0, y1, z0, z1, mat, opts) {
    return this.box(parent, x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, opts);
  }

  soft(parent, w, h, d, r, mat, x, y, z, { cast = true } = {}) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), mat);
    m.position.set(x, y, z);
    m.castShadow = cast && this.shadows;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  cyl(parent, rt, rb, h, mat, x, y, z, seg = 24, { cast = true } = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = cast && this.shadows;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  sphere(parent, r, mat, x, y, z, sx = 1, sy = 1, sz = 1, seg = 20) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg * 0.7), mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = this.shadows;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** Flat decal acting as ambient-occlusion under furniture. */
  contact(parent, x, z, w, d, opacity = 0.5, y = 0.052) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.blobMat.clone());
    m.material.opacity = opacity;
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.renderOrder = 2;
    parent.add(m);
    return m;
  }

  /** Horizontal slab with optional rectangular holes (floors, roofs, terraces). */
  slab(parent, pts, y0, thick, mat, holes = [], { cast = true } = {}) {
    const shape = new THREE.Shape();
    pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    for (const h of holes) {
      const path = new THREE.Path();
      path.moveTo(h[0], -h[2]); path.lineTo(h[1], -h[2]); path.lineTo(h[1], -h[3]); path.lineTo(h[0], -h[3]); path.lineTo(h[0], -h[2]);
      shape.holes.push(path);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    // box-project UVs so tiled textures keep a constant world scale
    const pos = geo.attributes.position, uv = geo.attributes.uv, n = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const ny = Math.abs(n.getY(i)), nx = Math.abs(n.getX(i));
      if (ny > 0.5) uv.setXY(i, pos.getX(i) / 6, pos.getZ(i) / 6);
      else if (nx > 0.5) uv.setXY(i, pos.getZ(i) / 6, pos.getY(i) / 6);
      else uv.setXY(i, pos.getX(i) / 6, pos.getY(i) / 6);
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y0;
    m.castShadow = cast && this.shadows;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
}

/** Seeded random for deterministic scatter. */
export function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
