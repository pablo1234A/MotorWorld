import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit, seeded } from './kit.js';
import { terrainHeight } from './environment.js';
import { furnish } from './furniture.js';

/**
 * Procedural villa. Local origin = centre of the ground floor, the sea is toward -z,
 * the entrance and drive come in from +z.
 *
 *   ground floor  x[-17,17]  z[-7,7]   y[0,4]     entry · living · kitchen
 *   upper floor   x[-12,17]  z[-9,7]   y[4.4,7.9] bath · suite (cantilevers 2 m)
 *   terrace slab  x[-22,22]  z[-28.5,-7]           infinity pool x[-9,15] z[-28.5,-18.5]
 */

export const BOUNDS = {
  gx0: -17, gx1: 17, gz0: -7, gz1: 7, gh: 4.0,
  ux0: -12, ux1: 17, uz0: -9, uz1: 7, uy0: 4.44, uh: 3.5,
};

export function buildVilla(params, { shadows = true, quality = 'high' } = {}) {
  const kit = new Kit(params, { shadows });
  const g = new THREE.Group();
  g.name = 'villa';
  const { mats } = kit;
  const B = BOUNDS;
  const T = 0.3; // wall thickness
  const GY0 = 0.04, GY1 = GY0 + B.gh;      // ground floor interior 0.04 → 4.04
  const FY1 = 4.44;                          // top of first-floor slab
  const UY1 = FY1 + B.uh;                    // upper ceiling underside

  /* ---------------------------------------------------------- foundations */
  const podium = kit.slab(g, [[-22, -7], [22, -7], [22, -28.5], [15, -28.5], [15, -18.5], [-9, -18.5], [-9, -28.5], [-22, -28.5], [-22, -7]],
    -0.34, 0.34, mats.terrace);
  podium.name = 'terrace';
  // the house plinth reaching back to the drive
  kit.span(g, -22, 22, -0.34, 0, -7, 11, mats.terrace);
  // interior floor
  kit.span(g, B.gx0, B.gx1, 0, GY0, B.gz0, B.gz1, mats.floorIn);
  // entry hall in a darker stone so the arrival reads as a threshold
  kit.span(g, B.gx0, -10, GY0, GY0 + 0.004, B.gz0, B.gz1, mats.stone, { cast: false });

  /* ---------------------------------------------------------- ground walls */
  const wallsG = new THREE.Group(); g.add(wallsG);
  const W = mats.wall, C = mats.concrete;
  // back wall (z = +7) with the entrance opening at x[-14.7,-12.3]
  kit.span(wallsG, B.gx0, -14.7, GY0, GY1, B.gz1 - T, B.gz1, W);
  kit.span(wallsG, -12.3, B.gx1, GY0, GY1, B.gz1 - T, B.gz1, W);
  kit.span(wallsG, -14.7, -12.3, 2.7, GY1, B.gz1 - T, B.gz1, W);
  // timber-clad entrance bay, cut open at the doorway
  kit.span(wallsG, -16.2, -14.7, GY0, GY1, B.gz1, B.gz1 + 0.12, mats.timberV);
  kit.span(wallsG, -12.3, -10.8, GY0, GY1, B.gz1, B.gz1 + 0.12, mats.timberV);
  kit.span(wallsG, -14.7, -12.3, 2.7, GY1, B.gz1, B.gz1 + 0.12, mats.timberV);
  // threshold frame in dark bronze
  kit.span(wallsG, -14.76, -14.7, GY0, 2.7, B.gz1 - T, B.gz1 + 0.13, mats.frame);
  kit.span(wallsG, -12.3, -12.24, GY0, 2.7, B.gz1 - T, B.gz1 + 0.13, mats.frame);
  kit.span(wallsG, -14.76, -12.24, 2.66, 2.72, B.gz1 - T, B.gz1 + 0.13, mats.frame);
  // glowing welcome strip over the door
  kit.span(wallsG, -14.5, -12.5, 2.74, 2.78, B.gz1 + 0.125, B.gz1 + 0.13, kit.glowMaterial(0xffd9a3, 2.6), { cast: false });
  // side walls
  kit.span(wallsG, B.gx0 - 0.0, B.gx0 + T, GY0, GY1, B.gz0, B.gz1, mats.timberV);
  kit.span(wallsG, B.gx1 - T, B.gx1, GY0, GY1, B.gz0, B.gz1, C);
  // front: entry hall closed, the rest is glass
  kit.span(wallsG, B.gx0, -10, GY0, GY1, B.gz0, B.gz0 + T, W);
  glassWall(kit, g, -10, B.gx1, B.gz0, GY0, GY1, 6);

  // timber-slat partition between entry and living, opening at z[-1.5,2.5]
  const slatGroup = new THREE.Group(); g.add(slatGroup);
  for (let z = -6.9; z <= 6.9; z += 0.34) {
    if (z > -1.5 && z < 2.5) continue;
    kit.span(slatGroup, -10.08, -9.92, GY0, GY1, z, z + 0.14, mats.timber);
  }
  kit.span(slatGroup, -10.12, -9.88, GY1 - 0.4, GY1, -7, 7, mats.frame);

  /* ---------------------------------------------------------- floor slab + roofs */
  // first-floor slab, with the stairwell cut out
  const stairHole = [9.2, 16.6, 5.15, 6.85];
  kit.slab(g, kit.rect(-18, 18, -13.8, 8.2), GY1, FY1 - GY1, C, [stairHole]);
  // soffit under the cantilever / terrace roof in warm timber
  kit.span(g, -9, 18, GY1 - 0.01, GY1, -13.5, -7.2, mats.timber, { cast: false });
  // glass ceiling-less balcony details are added with the suite
  // roof over the upper floor
  const roofY = UY1;
  kit.slab(g, kit.rect(-13.2, 18.4, -14.6, 8.4), roofY, 0.42, C);
  kit.span(g, -13.2, 18.4, roofY - 0.04, roofY, -14.6, -9.2, mats.timber, { cast: false });
  // parapet on the exposed ground-floor roof over the entry hall
  kit.span(g, -18, -12.4, FY1, FY1 + 0.5, -8.2, 8.2, C);

  /* ---------------------------------------------------------- upper walls */
  const wallsU = new THREE.Group(); g.add(wallsU);
  kit.span(wallsU, B.ux0, B.ux1, FY1, UY1, B.uz1 - T, B.uz1, W);                 // back
  kit.span(wallsU, B.ux0, B.ux0 + T, FY1, UY1, B.uz0, B.uz1, mats.timberV);        // west
  kit.span(wallsU, B.ux1 - T, B.ux1, FY1, UY1, B.uz0, B.uz1, C);                  // east
  glassWall(kit, g, B.ux0, B.ux1, B.uz0, FY1, UY1, 7);
  // bath / suite partition at x=-3 with a door opening z[-4,-1.2]
  kit.span(wallsU, -3.1, -2.9, FY1, UY1, B.uz0 + 0.1, -4, W);
  kit.span(wallsU, -3.1, -2.9, FY1, UY1, -1.2, B.uz1 - T, W);
  kit.span(wallsU, -3.1, -2.9, 6.6, UY1, -4, -1.2, W);

  // balcony (cantilever) with glass balustrade, y = FY1
  const bal = new THREE.Group(); g.add(bal);
  kit.span(bal, -4, 17.4, FY1 - 0.0, FY1 + 0.02, -13.5, -9, mats.terrace, { cast: false });
  glassPane(kit, bal, -4, 17.4, -13.45, FY1 + 0.02, FY1 + 1.12, mats);
  glassPaneZ(kit, bal, -4, -13.45, -9.0, FY1 + 0.02, FY1 + 1.12, mats);
  glassPaneZ(kit, bal, 17.4, -13.45, -9.0, FY1 + 0.02, FY1 + 1.12, mats);
  kit.span(bal, -4.04, 17.44, FY1 + 1.1, FY1 + 1.14, -13.5, -13.4, mats.frame, { cast: false });

  /* ---------------------------------------------------------- pool */
  const pool = new THREE.Group(); pool.name = 'pool'; g.add(pool);
  // basin walls + floor
  kit.span(pool, -9, 15, -2.0, -1.96, -28.5, -18.5, mats.basin, { cast: false });
  kit.span(pool, -9.02, -8.98, -2.0, -0.05, -28.5, -18.5, mats.basin, { cast: false });
  kit.span(pool, 14.98, 15.02, -2.0, -0.05, -28.5, -18.5, mats.basin, { cast: false });
  kit.span(pool, -9, 15, -2.0, -0.05, -18.52, -18.48, mats.basin, { cast: false });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(24, 10), mats.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(3, -0.12, -23.5);
  water.receiveShadow = true;
  pool.add(water);
  // submerged sun shelf
  kit.span(pool, -8.9, 14.9, -0.45, -0.4, -21.5, -18.6, mats.basin, { cast: false });
  // pool edge glow strips for night
  const strip = kit.glowMaterial(0x7fe8ff, 3.0);
  kit.span(pool, -8.7, 14.7, -0.45, -0.38, -18.65, -18.58, strip, { cast: false });

  /* ---------------------------------------------------------- structure details */
  // slender brass-dark fascia lines make the slabs read as machined edges
  kit.span(g, -18, 18, GY1 - 0.02, GY1 + 0.03, -13.8, -13.74, mats.frame, { cast: false });
  // recessed cove light under the roof edge
  const cove = kit.glowMaterial(0xffd9a3, 2.2);
  kit.span(g, -9, 17.9, roofY - 0.1, roofY - 0.06, -14.4, -14.3, cove, { cast: false });
  kit.span(g, -9, 17.9, GY1 - 0.14, GY1 - 0.1, -13.6, -13.5, cove, { cast: false });

  // optional pergola over the sunken pool terrace
  if (params.pergola) {
    for (let x = -20; x <= 20; x += 0.5) kit.span(g, x, x + 0.14, 3.55, 3.7, -17.8, -8.5, mats.timber, { cast: true });
    for (const x of [-20, 20]) for (const z of [-17.8, -8.7]) kit.span(g, x - 0.1, x + 0.1, 0, 3.55, z - 0.1, z + 0.1, mats.frame);
  }
  // optional guest wing on the west flank
  if (params.wing) {
    kit.span(g, -34, -18.6, -0.34, 0, -6, 6, mats.terrace);
    kit.span(g, -34, -19, 0, 3.4, 5.7, 6, W);
    kit.span(g, -34, -33.7, 0, 3.4, -6, 6, mats.timberV);
    glassWall(kit, g, -34, -19, -6, 0, 3.4, 4);
    kit.span(g, -34.6, -18.4, 3.4, 3.8, -6.8, 6.6, C);
    kit.span(g, -34, -19, 0.0, 0.04, -6, 6, mats.floorIn);
  }

  /* ---------------------------------------------------------- furniture + landscape */
  furnish(kit, g, B, { GY0, GY1, FY1, UY1 }, params);
  buildSite(kit, g, params, quality);

  /* ---------------------------------------------------------- anchors for cameras */
  return { group: g, kit, water, anchors: {} };
}

/* =================================================================== helpers */

function glassWall(kit, parent, x0, x1, z, y0, y1, bays) {
  const { mats } = kit;
  const w = x1 - x0;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, y1 - y0), mats.glass);
  pane.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  pane.renderOrder = 5;
  parent.add(pane);
  const step = w / bays;
  for (let i = 0; i <= bays; i++) {
    const x = x0 + i * step;
    kit.box(parent, 0.07, y1 - y0, 0.12, mats.frame, x, (y0 + y1) / 2, z, { cast: false });
  }
  kit.box(parent, w, 0.1, 0.14, mats.frame, (x0 + x1) / 2, y1 - 0.05, z, { cast: false });
  kit.box(parent, w, 0.08, 0.14, mats.frame, (x0 + x1) / 2, y0 + 0.04, z, { cast: false });
}

function glassPane(kit, parent, x0, x1, z, y0, y1, mats) {
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), mats.glass);
  pane.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  pane.renderOrder = 5;
  parent.add(pane);
}
function glassPaneZ(kit, parent, x, z0, z1, y0, y1, mats) {
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(z1 - z0), y1 - y0), mats.glass);
  pane.rotation.y = Math.PI / 2;
  pane.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
  pane.renderOrder = 5;
  parent.add(pane);
}

/* ============================================================ site / planting */

function buildSite(kit, g, params, quality) {
  const { mats } = kit;
  const rand = seeded(params.seed + 3);
  const tcfg = params.terrainCfg;
  const ground = (x, z) => terrainHeight(x, z, tcfg);
  const trees = new THREE.Group(); trees.name = 'planting'; g.add(trees);

  // approach drive: a ribbon laid on the terrain, curving toward the entrance
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-13.5, 0, 9), new THREE.Vector3(-13.5, 0, 22), new THREE.Vector3(-4, 0, 40),
    new THREE.Vector3(20, 0, 62), new THREE.Vector3(34, 0, 95), new THREE.Vector3(30, 0, 150),
  ]);
  const samples = curve.getSpacedPoints(70);
  const half = 2.6;
  const verts = [], idx = [], uvs = [];
  samples.forEach((p, i) => {
    const t = curve.getTangent(Math.min(i / 70, 1)); const nx = -t.z, nz = t.x;
    for (const s of [-1, 1]) {
      const x = p.x + nx * half * s, z = p.z + nz * half * s;
      verts.push(x, Math.max(ground(x, z), -0.3) + 0.06, z);
      uvs.push(s > 0 ? 1 : 0, i * 0.35);
    }
    if (i < 70) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const driveGeo = new THREE.BufferGeometry();
  driveGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  driveGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  driveGeo.setIndex(idx); driveGeo.computeVertexNormals();
  const drive = new THREE.Mesh(driveGeo, new THREE.MeshStandardMaterial({ color: params.drive, roughness: 0.95 }));
  drive.receiveShadow = true; trees.add(drive);

  // arrival court in front of the entrance
  kit.span(g, -17.5, -9.5, -0.34, 0.03, 7, 15, mats.terrace);

  const scatter = (n, area, fn, avoid) => {
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 40) {
      const x = area[0] + rand() * (area[1] - area[0]);
      const z = area[2] + rand() * (area[3] - area[2]);
      if (avoid && avoid(x, z)) continue;
      out.push(fn(x, z));
    }
    return out;
  };
  const nearHouse = (x, z) => x > -26 && x < 26 && z > -30 && z < 16;
  const onDrive = (x, z) => Math.abs(x - (-13.5 + (z - 9) * 0.32)) < 5 && z > 7 && z < 60;

  const kinds = params.veg === 'mixed' ? ['palm', 'cypress', 'olive'] : [params.veg];

  const addPalms = (spots) => {
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 1, 6); trunkGeo.translate(0, 0.5, 0);
    const frond = new THREE.ConeGeometry(0.42, 3.4, 4); frond.rotateZ(Math.PI / 2); frond.translate(1.7, 0, 0); frond.scale(1, 0.18, 1);
    const crownParts = [];
    for (let i = 0; i < 9; i++) {
      const f = frond.clone();
      f.rotateZ(-0.42 - (i % 3) * 0.12);
      f.rotateY((i / 9) * Math.PI * 2);
      crownParts.push(f);
    }
    const crownGeo = mergeGeometries(crownParts);
    const tm = new THREE.InstancedMesh(trunkGeo, mats.bark, spots.length);
    const cm = new THREE.InstancedMesh(crownGeo, mats.leafDark, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    spots.forEach(([x, z], i) => {
      const h = 6 + rand() * 6, y = ground(x, z);
      q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.12, rand() * 6, (rand() - 0.5) * 0.12));
      m.compose(p.set(x, y, z), q, s.set(1, h, 1)); tm.setMatrixAt(i, m);
      const sc = 0.9 + rand() * 0.5;
      m.compose(p.set(x, y + h, z), q, s.set(sc, sc, sc)); cm.setMatrixAt(i, m);
    });
    tm.castShadow = cm.castShadow = kit.shadows; tm.receiveShadow = cm.receiveShadow = true;
    trees.add(tm, cm);
  };
  const addCypress = (spots) => {
    const geo = new THREE.ConeGeometry(0.85, 1, 9); geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, mats.leafDark, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    spots.forEach(([x, z], i) => {
      const h = 7 + rand() * 5;
      m.compose(p.set(x, ground(x, z) - 0.2, z), q.identity(), s.set(0.8 + rand() * 0.3, h, 0.8 + rand() * 0.3)); im.setMatrixAt(i, m);
    });
    im.castShadow = kit.shadows; im.receiveShadow = true; trees.add(im);
  };
  const addOlives = (spots) => {
    const trunk = new THREE.CylinderGeometry(0.14, 0.24, 1.4, 6); trunk.translate(0, 0.7, 0);
    const crown = new THREE.IcosahedronGeometry(1, 1); crown.scale(2.2, 1.3, 2.2); crown.translate(0, 2.0, 0);
    const tm = new THREE.InstancedMesh(trunk, mats.bark, spots.length);
    const cm = new THREE.InstancedMesh(crown, mats.leaf, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    spots.forEach(([x, z], i) => {
      const sc = 0.8 + rand() * 0.7;
      q.setFromEuler(new THREE.Euler(0, rand() * 6, 0));
      m.compose(p.set(x, ground(x, z), z), q, s.set(sc, sc, sc)); tm.setMatrixAt(i, m); cm.setMatrixAt(i, m);
    });
    tm.castShadow = cm.castShadow = kit.shadows; tm.receiveShadow = cm.receiveShadow = true;
    trees.add(tm, cm);
  };

  const dens = quality === 'low' ? 0.5 : 1;
  const fns = { palm: addPalms, cypress: addCypress, olive: addOlives };
  const near = (n) => scatter(Math.round(n * dens), [-46, 46, -4, 58], (x, z) => [x, z], (x, z) => nearHouse(x, z) || onDrive(x, z));
  const far = (n) => scatter(Math.round(n * dens), [-130, 130, 40, 150], (x, z) => [x, z], (x, z) => onDrive(x, z));
  for (const k of kinds) {
    const share = kinds.length;
    fns[k]([...near(22 / share), ...far(70 / share)]);
  }
  // a deliberate line of tall trees framing the entrance court
  const line = [];
  for (let i = 0; i < 6; i++) line.push([-21 + i * 0.001, 8 + i * 4.2]);
  fns[kinds[0]](line);

  // understorey: clipped shrubs and weathered boulders break up the large lawns
  {
    const shrubGeo = new THREE.IcosahedronGeometry(1, 1);
    const n = Math.round(150 * dens);
    const sm = new THREE.InstancedMesh(shrubGeo, mats.leaf, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let placed = 0, guard = 0;
    while (placed < n && guard++ < n * 30) {
      const x = -70 + rand() * 140, z = -34 + rand() * 100;
      if (onDrive(x, z) || (x > -24 && x < 24 && z > -30 && z < 18)) continue;
      const y = ground(x, z);
      if (y < tcfg.seaLevel + 4) continue;
      const r = 0.6 + rand() * 1.1;
      m.compose(p.set(x, y + r * 0.35, z), q.setFromEuler(new THREE.Euler(0, rand() * 6, 0)), s.set(r * 1.4, r * 0.8, r * 1.2));
      sm.setMatrixAt(placed++, m);
    }
    sm.count = placed; sm.castShadow = kit.shadows; sm.receiveShadow = true; trees.add(sm);
    const rockMat = new THREE.MeshStandardMaterial({ color: tcfg.rock, roughness: 1, flatShading: true });
    const rn = Math.round(46 * dens);
    const rm = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, rn);
    placed = 0; guard = 0;
    while (placed < rn && guard++ < rn * 30) {
      const x = -80 + rand() * 160, z = -60 + rand() * 120;
      if (onDrive(x, z) || (x > -26 && x < 26 && z > -32 && z < 18)) continue;
      const y = ground(x, z);
      if (y < tcfg.seaLevel + 1) continue;
      const r = 0.35 + rand() * 0.9;
      m.compose(p.set(x, y + r * 0.2, z), q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3)), s.set(r * 1.3, r * 0.7, r));
      rm.setMatrixAt(placed++, m);
    }
    rm.count = placed; rm.castShadow = kit.shadows; rm.receiveShadow = true; trees.add(rm);
  }

  // low planters flanking the front door
  for (const x of [-16.2, -10.8]) {
    kit.span(g, x - 0.6, x + 0.6, 0, 0.55, 7.2, 8.4, mats.concrete);
    kit.sphere(g, 0.55, mats.leaf, x, 0.85, 7.8, 1, 0.9, 1, 14);
  }
  // garden terrace edge shrubs along the pool
  for (let i = 0; i < 9; i++) kit.sphere(g, 0.7 + rand() * 0.3, mats.leaf, -21.5 + (i % 2) * 0.5, 0.45, -9 - i * 2.1, 1, 0.7, 1, 12);
  for (let i = 0; i < 9; i++) kit.sphere(g, 0.7 + rand() * 0.3, mats.leaf, 21.4 - (i % 2) * 0.5, 0.45, -9 - i * 2.1, 1, 0.7, 1, 12);
}
