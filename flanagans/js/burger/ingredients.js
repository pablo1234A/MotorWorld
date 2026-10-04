// Procedural ingredient builders.
// Each builder returns { object, height } where `object` sits on y = 0 and
// grows upwards to roughly `height`. The stacker (Burger.js) only needs
// that contract, which is the same contract a GLB layer fulfils.
import * as THREE from 'three';
import { fbm3, noise3, ringNoise, rng } from './noise.js';
import * as TX from './textures.js';

const TAU = Math.PI * 2;
const matCache = new Map();
const mat = (key, make) => {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
};

// ------------------------------------------------------------ geometry utils

// Averages normals of vertices that share a position (lathe / polar seams).
function weldNormals(geo) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)}|${p.getY(i).toFixed(4)}|${p.getZ(i).toFixed(4)}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(i);
  }
  const v = new THREE.Vector3();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of g) v.x += n.getX(i), v.y += n.getY(i), v.z += n.getZ(i);
    v.normalize();
    for (const i of g) n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
  return geo;
}

function planarUV(geo, radius, sideStretch = 0) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / (2 * radius) + 0.5 + p.getY(i) * sideStretch;
    uv[i * 2 + 1] = p.getZ(i) / (2 * radius) + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Disc-shaped grid: fn(rho 0..1, theta) -> [x, y, z]. Faces +Y.
function polarDisc(rings, segs, fn) {
  const pos = [];
  for (let k = 0; k <= rings; k++) {
    const rho = k / rings;
    for (let s = 0; s <= segs; s++) {
      const th = (s / segs) * TAU;
      pos.push(...fn(rho, th));
    }
  }
  const idx = [];
  const row = segs + 1;
  for (let k = 0; k < rings; k++) {
    for (let s = 0; s < segs; s++) {
      const a = k * row + s, b = a + row, c = b + 1, d = a + 1;
      idx.push(a, d, b, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

function lathe(points, segs = 96) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs);
}

function quarter(cx, cy, r, a0, a1, steps, out) {
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
}

function shadowed(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

// ------------------------------------------------------------ materials

const M = {
  crust: () =>
    mat('crust', () => {
      const t = TX.bunCrust();
      return new THREE.MeshPhysicalMaterial({
        map: t.map, bumpMap: t.bump, bumpScale: 0.6,
        roughness: 0.52, clearcoat: 0.32, clearcoatRoughness: 0.42,
        sheen: 0.25, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffb46a),
      });
    }),
  crumb: () =>
    mat('crumb', () => {
      const t = TX.crumb();
      return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 1.2, roughness: 0.92, side: THREE.DoubleSide });
    }),
  meat: (kind) =>
    mat('meat:' + kind, () => {
      const t = TX.meat(kind);
      return new THREE.MeshPhysicalMaterial({
        map: t.map, bumpMap: t.bump, bumpScale: 2.2,
        roughness: kind === 'chicken' ? 0.7 : 0.58,
        clearcoat: kind === 'chicken' ? 0.1 : 0.35, clearcoatRoughness: 0.45,
      });
    }),
  cheese: (kind) =>
    mat('cheese:' + kind, () => {
      const t = TX.cheese(kind);
      return kind === 'goat'
        ? new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 1.5, roughness: 0.78, sheen: 0.4, sheenColor: new THREE.Color(0xffffff) })
        : new THREE.MeshPhysicalMaterial({
            map: t.map, bumpMap: t.bump, bumpScale: 0.4, roughness: 0.34,
            clearcoat: 0.45, clearcoatRoughness: 0.25, sheen: 0.6, sheenColor: new THREE.Color(0xffb347),
            side: THREE.DoubleSide,
          });
    }),
  leaf: (kind) =>
    mat('leaf:' + kind, () =>
      new THREE.MeshPhysicalMaterial({
        map: TX.leaf(kind).map, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.3,
        sheen: 0.5, sheenColor: new THREE.Color(0xe8ffb0), side: THREE.DoubleSide,
      })
    ),
  tomatoSkin: () => mat('tomSkin', () => new THREE.MeshPhysicalMaterial({ color: 0xc21d10, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.12 })),
  tomatoFlesh: () => mat('tomFlesh', () => new THREE.MeshPhysicalMaterial({ map: TX.tomatoFlesh().map, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 })),
  bacon: () =>
    mat('bacon', () => {
      const t = TX.bacon();
      return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 1.4, roughness: 0.4, clearcoat: 0.65, clearcoatRoughness: 0.3 });
    }),
  sauce: (color) =>
    mat('sauce:' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.3, sheenColor: new THREE.Color(color) })),
  glossy: () => mat('glossy', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, clearcoat: 0.85, clearcoatRoughness: 0.2 })),
  zucSkin: () => mat('zucSkin', () => new THREE.MeshPhysicalMaterial({ color: 0x24461a, roughness: 0.35, clearcoat: 0.5 })),
  zucFlesh: () => mat('zucFlesh', () => new THREE.MeshStandardMaterial({ map: TX.zucchiniFlesh().map, roughness: 0.55 })),
  onionRaw: () => mat('onionRaw', () => new THREE.MeshPhysicalMaterial({ color: 0xead2e4, roughness: 0.22, clearcoat: 0.6, sheen: 0.6, sheenColor: new THREE.Color(0x9a3a8a) })),
};

// ------------------------------------------------------------ buns

export function bunTop({ seed = 1, radius = 1, height = 0.64 } = {}) {
  const R = radius, H = height;
  const pts = [];
  quarter(R - 0.08, 0.08, 0.08, -Math.PI / 2, 0, 6, pts);
  const n = 2.5;
  for (let i = 1; i <= 30; i++) {
    const phi = (i / 30) * (Math.PI / 2);
    const c = Math.max(0, Math.cos(phi)), s = Math.sin(phi);
    pts.push([R * Math.pow(c, 2 / n), 0.08 + (H - 0.08) * Math.pow(s, 2 / n)]);
  }
  const geo = lathe(pts, 112);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const th = Math.atan2(z, x);
    const k = 1 + 0.028 * ringNoise(th, 1.4, seed) + 0.006 * noise3(x * 7, y * 7, z * 7);
    const rad = Math.min(1, Math.hypot(x, z) / R);
    const lift = 1 + 0.07 * ringNoise(th, 1.1, seed + 3) * (y / H) * rad;
    p.setXYZ(i, x * k, y * lift, z * k);
  }
  weldNormals(geo);
  const crust = new THREE.Mesh(geo, M.crust());

  const under = polarDisc(10, 112, (rho, th) => {
    const k = 1 + 0.028 * ringNoise(th, 1.4, seed);
    const r = rho * (R - 0.08) * k;
    return [Math.cos(th) * r, 0.012 + 0.03 * (1 - rho * rho), Math.sin(th) * r];
  });
  // Faces downwards: mirror the bulge and flip the winding.
  under.scale(1, -1, 1);
  under.translate(0, 0.045, 0);
  const ix = under.index.array;
  for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
  planarUV(under, R);
  weldNormals(under);
  const crumbMesh = new THREE.Mesh(under, M.crumb());

  const g = new THREE.Group();
  g.add(crust, crumbMesh);
  return { object: shadowed(g), height: H };
}

export function bunBottom({ seed = 2, radius = 1, height = 0.34 } = {}) {
  const R = radius, H = height;
  const pts = [[0, 0]];
  for (let i = 1; i <= 6; i++) pts.push([(R - 0.1) * (i / 6), 0]);
  quarter(R - 0.1, 0.1, 0.1, -Math.PI / 2, 0, 6, pts);
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    pts.push([R - 0.012 * t + 0.01 * Math.sin(Math.PI * t), 0.1 + (H - 0.13) * t]);
  }
  pts.push([R - 0.03, H]);
  const geo = lathe(pts, 112);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const th = Math.atan2(z, x);
    const k = 1 + 0.022 * ringNoise(th, 1.4, seed);
    p.setXYZ(i, x * k, y, z * k);
    uv.setY(i, 0.46 - 0.34 * (y / H));
  }
  weldNormals(geo);
  const crust = new THREE.Mesh(geo, M.crust());

  const top = polarDisc(10, 112, (rho, th) => {
    const k = 1 + 0.022 * ringNoise(th, 1.4, seed);
    const r = rho * (R - 0.03) * k;
    return [Math.cos(th) * r, H - 0.012 * rho * rho, Math.sin(th) * r];
  });
  planarUV(top, R);
  weldNormals(top);
  const g = new THREE.Group();
  g.add(crust, new THREE.Mesh(top, M.crumb()));
  return { object: shadowed(g), height: H };
}

// ------------------------------------------------------------ patties

export function patty({ kind = 'beef', seed = 3, radius = 1.08, height = 0.26, lace = 0 } = {}) {
  const r = radius, h = height, e = Math.min(h * 0.42, 0.08);
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push([((r - e) * i) / 8, 0]);
  quarter(r - e, e, e, -Math.PI / 2, 0, 4, pts);
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    pts.push([r + 0.025 * Math.sin(Math.PI * t), e + (h - 2 * e) * t]);
  }
  quarter(r - e, h - e, e, 0, Math.PI / 2, 4, pts);
  for (let i = 7; i >= 0; i--) pts.push([((r - e) * i) / 8, h]);
  const geo = lathe(pts, 128);
  geo.computeVertexNormals();
  const p = geo.attributes.position, nrm = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const th = Math.atan2(z, x);
    const rad = Math.hypot(x, z) / r;
    let d = fbm3(x * 2.2 + seed, y * 2.2, z * 2.2, 3) * 0.03 + noise3(x * 14, y * 14, z * 14) * 0.008;
    let k = 1 + 0.035 * ringNoise(th, 1.6, seed);
    if (lace) k += lace * Math.pow(rad, 6) * (0.5 + 0.5 * ringNoise(th, 6, seed + 9, 4));
    p.setXYZ(i, x * k + nrm.getX(i) * d, y + nrm.getY(i) * d * 0.6, z * k + nrm.getZ(i) * d);
  }
  planarUV(geo, r * 1.1, 0.25);
  weldNormals(geo);
  return { object: shadowed(new THREE.Mesh(geo, M.meat(kind))), height: h };
}

// ------------------------------------------------------------ cheese

export function cheeseSlice({ seed = 5, size = 2.02, rotation = 0.6, drapeFrom = 0.98 } = {}) {
  const geo = new THREE.PlaneGeometry(size, size, 64, 64);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i);
    const d = Math.hypot(x, z);
    let y = 0.008 + noise3(x * 3 + seed, 0, z * 3) * 0.006;
    if (d > drapeFrom) {
      const o = d - drapeFrom;
      y -= o * o * 0.95 + o * 0.12 + Math.max(0, noise3(x * 4, seed, z * 4)) * o * 0.22;
      const pull = 1 - o * 0.22;
      x *= pull;
      z *= pull;
    }
    p.setXYZ(i, x, y, z);
  }
  geo.rotateY(rotation);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, M.cheese('cheddar'));
  return { object: shadowed(mesh), height: 0.022 };
}

export function goatCheese({ seed = 6 } = {}) {
  const g = new THREE.Group();
  const R = rng(seed);
  const spots = [[0.36, 0.15], [-0.32, 0.38], [-0.12, -0.42], [0.42, -0.42]];
  for (const [x, z] of spots) {
    const r = 0.36 + R() * 0.05, h = 0.11;
    const pts = [];
    for (let i = 0; i <= 4; i++) pts.push([((r - 0.04) * i) / 4, 0]);
    quarter(r - 0.04, 0.04, 0.04, -Math.PI / 2, 0, 3, pts);
    quarter(r - 0.05, h - 0.05, 0.05, 0, Math.PI / 2, 4, pts);
    for (let i = 3; i >= 0; i--) pts.push([((r - 0.05) * i) / 4, h + 0.008 * (1 - i / 4)]);
    const geo = lathe(pts, 48);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const k = 1 + noise3(px * 8 + x * 10, py * 8, pz * 8) * 0.05;
      p.setXYZ(i, px * k, py * (py > h * 0.6 ? 1 + 0.12 * k - 0.12 : 1), pz * k);
    }
    planarUV(geo, 0.5);
    weldNormals(geo);
    const m = new THREE.Mesh(geo, M.cheese('goat'));
    m.position.set(x, 0, z);
    m.rotation.set((R() - 0.5) * 0.08, R() * TAU, (R() - 0.5) * 0.08);
    g.add(m);
  }
  return { object: shadowed(g), height: 0.12 };
}

// ------------------------------------------------------------ greens

function leafMesh(seed, radius, kind, ruffle = 1) {
  const geo = polarDisc(26, 200, (rho, th) => {
    const edgeN = ringNoise(th, 2.4, seed, 4);
    const r = rho * radius * (1 + 0.12 * edgeN + 0.025 * Math.sin(th * 29 + seed) * Math.pow(rho, 3));
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    let y =
      Math.pow(rho, 2) * 0.085 * ruffle * Math.sin(th * 7 + seed * 1.7 + edgeN * 2) +
      Math.pow(rho, 5) * 0.06 * ruffle * Math.sin(th * 23 + seed) +
      noise3(x * 2.5, seed, z * 2.5) * 0.05 -
      Math.pow(rho, 3) * 0.12 + 0.07;
    return [x, y, z];
  });
  planarUV(geo, radius * 1.15);
  weldNormals(geo);
  return new THREE.Mesh(geo, M.leaf(kind));
}

export function lettuce({ seed = 7 } = {}) {
  const g = new THREE.Group();
  const a = leafMesh(seed, 1.22, 'iceberg');
  const b = leafMesh(seed + 5, 1.12, 'iceberg', 0.8);
  b.rotation.y = 2.1;
  b.position.y = 0.035;
  g.add(a, b);
  return { object: shadowed(g), height: 0.12 };
}

export function mixedGreens({ seed = 8 } = {}) {
  const g = new THREE.Group();
  const R = rng(seed);
  for (let i = 0; i < 5; i++) {
    const m = leafMesh(seed + i * 3, 0.6 + R() * 0.2, i % 2 ? 'mixed' : 'iceberg', 0.7);
    const a = (i / 5) * TAU + R();
    const d = i === 0 ? 0 : 0.5 + R() * 0.15;
    m.position.set(Math.cos(a) * d, 0.02 * i, Math.sin(a) * d);
    m.rotation.set((R() - 0.5) * 0.3, R() * TAU, (R() - 0.5) * 0.3);
    g.add(m);
  }
  return { object: shadowed(g), height: 0.14 };
}

// ------------------------------------------------------------ veg slices

function slices({ count, radius, height, ring, materials, seed, wobble = 0.06 }) {
  const g = new THREE.Group();
  const R = rng(seed);
  for (let i = 0; i < count; i++) {
    const geo = new THREE.CylinderGeometry(radius * (0.95 + R() * 0.1), radius, height, 48, 1);
    const m = new THREE.Mesh(geo, materials);
    const a = (i / count) * TAU + R() * 0.4;
    const d = count === 1 ? 0 : ring;
    m.position.set(Math.cos(a) * d, height / 2 + R() * 0.012, Math.sin(a) * d);
    m.rotation.set((R() - 0.5) * wobble, R() * TAU, (R() - 0.5) * wobble);
    g.add(m);
  }
  return g;
}

export function tomato({ seed = 9 } = {}) {
  const g = slices({
    count: 3, radius: 0.5, height: 0.1, ring: 0.42, seed, wobble: 0.16,
    materials: [M.tomatoSkin(), M.tomatoFlesh(), M.tomatoFlesh()],
  });
  return { object: shadowed(g), height: 0.12 };
}

export function zucchini({ seed = 10 } = {}) {
  const g = slices({
    count: 5, radius: 0.27, height: 0.05, ring: 0.55, seed,
    materials: [M.zucSkin(), M.zucFlesh(), M.zucFlesh()],
  });
  return { object: shadowed(g), height: 0.08 };
}

export function onionRings({ seed = 11 } = {}) {
  const g = new THREE.Group();
  const R = rng(seed);
  for (let i = 0; i < 6; i++) {
    const r = 0.16 + R() * 0.2;
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 8, 48), M.onionRaw());
    const a = R() * TAU, d = 0.2 + R() * 0.5;
    m.position.set(Math.cos(a) * d, 0.025, Math.sin(a) * d);
    m.rotation.set(Math.PI / 2 + (R() - 0.5) * 0.15, 0, R());
    g.add(m);
  }
  return { object: shadowed(g), height: 0.06 };
}

// ------------------------------------------------------------ bacon

export function baconStrips({ seed = 12 } = {}) {
  const g = new THREE.Group();
  const conf = [
    [0.35, 0.18, 0],
    [-0.5, -0.2, 1.7],
  ];
  for (const [rot, off, ph] of conf) {
    const geo = new THREE.BoxGeometry(2.3, 0.026, 0.34, 140, 1, 8);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const wave = 0.05 * Math.sin(x * 4.1 + ph + seed) + 0.018 * Math.sin(x * 11 + ph * 2) + noise3(x * 3, seed, z * 3) * 0.015;
      const tw = 0.08 * Math.sin(x * 2.3 + ph);
      const width = 1 + 0.12 * noise3(x * 2 + ph, 4, seed);
      p.setXYZ(i, x, y + wave + z * tw, z * width + 0.035 * Math.sin(x * 2.6 + ph));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M.bacon());
    m.rotation.y = rot;
    m.position.set(0, 0.05 + (ph ? 0.03 : 0), off);
    g.add(m);
  }
  return { object: shadowed(g), height: 0.1 };
}

// ------------------------------------------------------------ sauce

export function sauce({ seed = 13, color = 0xe9893c, radius = 0.95, drips = 5 } = {}) {
  const g = new THREE.Group();
  const edge = (th) => radius * (1 + 0.06 * ringNoise(th, 3, seed, 3));
  // A glossy puddle: domed centre, rounded lip that rolls over the edge.
  const pts = [[0, 0.1]];
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    pts.push([0.84 * t, 0.045 + 0.055 * Math.pow(1 - t * t, 1.4)]);
  }
  quarter(0.84, 0.0, 0.045, Math.PI / 2, -Math.PI / 3, 8, pts);
  const geo = lathe(pts.reverse(), 128);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const th = Math.atan2(z, x);
    const k = edge(th) / 0.9;
    p.setXYZ(i, x * k, y + noise3(x * 5, seed, z * 5) * 0.006, z * k);
  }
  weldNormals(geo);
  const material = M.sauce(color);
  g.add(new THREE.Mesh(geo, material));
  const R = rng(seed);
  for (let i = 0; i < drips; i++) {
    const th = (i / drips) * TAU + R() * 0.6;
    const rad = 0.06 + R() * 0.03;
    const len = R() * 0.07;
    const d = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 6, 12), material);
    const r = edge(th) * 0.975;
    d.position.set(Math.cos(th) * r, -len / 2 - 0.01, Math.sin(th) * r);
    d.scale.set(1, 1, 0.55);
    d.rotation.y = -th + Math.PI / 2;
    g.add(d);
  }
  return { object: shadowed(g), height: 0.05 };
}

// ------------------------------------------------------------ toppings

export function caramelizedOnion({ seed = 14 } = {}) {
  const R = rng(seed);
  const count = 80;
  const geo = new THREE.TorusGeometry(1, 0.2, 6, 16, 2.6);
  const im = new THREE.InstancedMesh(geo, M.glossy(), count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), t = new THREE.Vector3();
  const c = new THREE.Color();
  const cols = [0x9a4a12, 0xb8621c, 0x7a3409, 0xc8782a];
  for (let i = 0; i < count; i++) {
    const r = 0.88 * Math.sqrt(R()), a = R() * TAU;
    t.set(Math.cos(a) * r, 0.02 + R() * 0.07, Math.sin(a) * r);
    e.set(Math.PI / 2 + (R() - 0.5) * 0.6, R() * TAU, (R() - 0.5) * 0.6);
    const sc = 0.08 + R() * 0.09;
    s.set(sc, sc, sc * 0.9);
    m4.compose(t, q.setFromEuler(e), s);
    im.setMatrixAt(i, m4);
    im.setColorAt(i, c.setHex(cols[i % cols.length]));
  }
  return { object: shadowed(im), height: 0.09 };
}

export function pulledPork({ seed = 15 } = {}) {
  const R = rng(seed);
  const g = new THREE.Group();
  // glossy BBQ bed so the pile reads as one mass, not loose strands
  const bed = sauce({ seed: seed + 1, color: 0x4a1608, radius: 0.92, drips: 5 }).object;
  g.add(bed);
  // Shredded meat = clumps of roughly parallel fibres.
  const clumps = 72, per = 8, count = clumps * per;
  const geo = new THREE.CapsuleGeometry(1, 1, 3, 6);
  const im = new THREE.InstancedMesh(geo, M.glossy(), count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qf = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), t = new THREE.Vector3(), o = new THREE.Vector3();
  const c = new THREE.Color();
  const cols = [0x6a2a14, 0x7e3518, 0x8f421f, 0x5a2410, 0xa0532a, 0x4c1d0c];
  let n = 0;
  for (let k = 0; k < clumps; k++) {
    const rho = Math.sqrt(R()), a = R() * TAU;
    const r = rho * 0.9;
    const hmax = 0.22 * (1 - rho * rho) + 0.04;
    const cx = Math.cos(a) * r, cy = 0.06 + R() * hmax, cz = Math.sin(a) * r;
    e.set(Math.PI / 2 + (R() - 0.5) * 0.5, R() * TAU, 0, 'YXZ');
    q.setFromEuler(e);
    const len = 0.1 + R() * 0.1;
    for (let f = 0; f < per; f++) {
      o.set((R() - 0.5) * 0.11, (R() - 0.5) * 0.06, (R() - 0.5) * 0.11);
      t.set(cx + o.x, cy + o.y, cz + o.z);
      qf.setFromEuler(new THREE.Euler((R() - 0.5) * 0.35, 0, (R() - 0.5) * 0.35)).premultiply(q);
      const th = 0.024 + R() * 0.02;
      s.set(th, len * (0.7 + R() * 0.5), th * 0.8);
      m4.compose(t, qf, s);
      im.setMatrixAt(n, m4);
      im.setColorAt(n++, c.setHex(cols[(k + f) % cols.length]));
    }
  }
  g.add(im);
  return { object: shadowed(g), height: 0.38 };
}

export const BUILDERS = {
  bunTop, bunBottom, patty, cheeseSlice, goatCheese, lettuce, mixedGreens,
  tomato, zucchini, onionRings, baconStrips, sauce, caramelizedOnion, pulledPork,
};
