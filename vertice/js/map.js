// Mapa "PUERTO VARGA": distrito urbano-industrial con plaza central, mercado (oeste),
// almacenes y patio de contenedores (este), parque, gasolinera e interiores.
import * as THREE from 'three';
import { Builder, F } from './builder.js';
import { World } from './world.js';
import { Nav } from './nav.js';
import { mulberry32 } from './util.js';
import { tex } from './textures.js';

export const BOUNDS = { minX: -80, minZ: -64, maxX: 80, maxZ: 64 };
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function makeMaterials(T, atmos) {
  const wet = atmos === 'storm';
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true }, o));
  const M = {
    asphalt: std({ map: T.asphalt.map, normalMap: T.asphalt.normalMap, roughness: wet ? 0.38 : 0.93, metalness: 0.0, normalScale: new THREE.Vector2(0.8, 0.8) }),
    tiles: std({ map: T.tiles.map, normalMap: T.tiles.normalMap, roughness: wet ? 0.45 : 0.86 }),
    concrete: std({ map: T.concrete.map, normalMap: T.concrete.normalMap, roughness: wet ? 0.6 : 0.92 }),
    roof: std({ map: T.concrete.map, normalMap: T.concrete.normalMap, roughness: 0.95, color: 0x8a8a86 }),
    facadeA: std({ map: T.facadeA.map, normalMap: T.facadeA.normalMap, roughness: 0.82 }),
    facadeB: std({ map: T.facadeB.map, normalMap: T.facadeB.normalMap, roughness: 0.82 }),
    facadeC: std({ map: T.facadeC.map, normalMap: T.facadeC.normalMap, roughness: 0.8 }),
    brick: std({ map: T.brick.map, normalMap: T.brick.normalMap, roughness: 0.9 }),
    corrugated: std({ map: T.corrugated.map, normalMap: T.corrugated.normalMap, roughness: 0.55, metalness: 0.55 }),
    container: std({ map: T.container.map, normalMap: T.container.normalMap, roughness: 0.6, metalness: 0.45 }),
    metal: std({ map: T.metal.map, normalMap: T.metal.normalMap, roughness: 0.42, metalness: 0.85 }),
    metalDark: std({ map: T.metal.map, roughness: 0.55, metalness: 0.7, color: 0x3a3d40 }),
    wood: std({ map: T.wood.map, normalMap: T.wood.normalMap, roughness: 0.82 }),
    dirt: std({ map: T.dirt.map, normalMap: T.dirt.normalMap, roughness: wet ? 0.55 : 1.0 }),
    grass: std({ map: T.grass.map, normalMap: T.grass.normalMap, roughness: 1.0 }),
    plaster: std({ map: T.concrete.map, roughness: 0.9, color: 0xd9d3c7 }),
    floorInt: std({ map: T.tiles.map, normalMap: T.tiles.normalMap, roughness: 0.5, color: 0xb8b2a6 }),
    paint: std({ roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    carPaint: std({ roughness: wet ? 0.22 : 0.35, metalness: 0.55 }),
    glassDark: std({ roughness: 0.08, metalness: 0.9, color: 0x1a2229 }),
    rubber: std({ roughness: 0.9, color: 0x1a1a1a }),
    foliage: std({ roughness: 0.95, flatShading: true }),
    trunk: std({ map: T.wood.map, roughness: 1.0, color: 0x5a4632 }),
    lamp: std({ emissive: 0xffd7a0, emissiveIntensity: atmos === 'noon' ? 0.2 : 2.2, color: 0xfff1d8 }),
    cloth: std({ roughness: 0.95, side: THREE.DoubleSide }),
    puddle: std({ roughness: 0.03, metalness: 0.1, color: 0x101214, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, transparent: true, opacity: wet ? 0.92 : 0.6 }),
    signs: std({ roughness: 0.6 }),
    cardboard: std({ map: T.wood.map, roughness: 0.95, color: 0xb08a5a }),
  };
  return M;
}

export function buildMap(T, Q, atmos, sizeT) {
  const { minX, minZ, maxX, maxZ } = BOUNDS;
  const B = new Builder(minX, minZ, 1000);
  const W = new World(minX, minZ, maxX, maxZ, 4);
  const M = makeMaterials(T, atmos);
  const rnd = mulberry32(90210);
  const R = (a, b) => a + rnd() * (b - a);
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const group = new THREE.Group();
  const mm = []; // minimapa
  const extras = { lamps: [], fires: [], smokeCols: [], supplies: [], breakGlass: [], barrels: [], crates: [] };
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const mat4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => { _e.set(rx, ry, rz); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z); return _m4.clone().compose(_p, _q, _s); };

  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1),
    cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1),
    ico: new THREE.IcosahedronGeometry(1, 1),
    cone: new THREE.ConeGeometry(0.5, 1, 6),
  };

  // ------------------------------------------------------------- helpers
  const solid = (x0, y0, z0, x1, y1, z1, props) => W.addBox(x0, y0, z0, x1, y1, z1, props);
  function ground(key, x0, z0, x1, z1, y = 0, tile = 4, color) {
    B.box(key, x0, y - 0.05, z0, x1, y, z1, { faces: F.py, tile: [tile, tile], color });
    mm.push({ x0, z0, x1, z1, t: key });
  }
  const tints = {
    facadeA: () => [R(0.85, 1), R(0.82, 0.95), R(0.75, 0.9)],
    facadeB: () => [R(0.8, 1), R(0.75, 0.92), R(0.7, 0.85)],
    facadeC: () => [R(0.75, 0.95), R(0.78, 0.95), R(0.8, 1)],
    brick: () => [R(0.85, 1), R(0.85, 1), R(0.85, 1)],
  };
  function roofClutter(x0, z0, x1, z1, h) {
    // parapeto
    const t = 0.25, ph = 0.8;
    B.box('concrete', x0, h, z0, x1, h + ph, z0 + t, { tile: [4, 4], color: [0.8, 0.8, 0.78] });
    B.box('concrete', x0, h, z1 - t, x1, h + ph, z1, { tile: [4, 4], color: [0.8, 0.8, 0.78] });
    B.box('concrete', x0, h, z0 + t, x0 + t, h + ph, z1 - t, { tile: [4, 4], color: [0.8, 0.8, 0.78] });
    B.box('concrete', x1 - t, h, z0 + t, x1, h + ph, z1 - t, { tile: [4, 4], color: [0.8, 0.8, 0.78] });
    const n = RI(1, 3);
    for (let i = 0; i < n; i++) {
      const cx = R(x0 + 2, x1 - 2), cz = R(z0 + 2, z1 - 2);
      if (rnd() < 0.5) B.box('metal', cx - 0.8, h, cz - 0.6, cx + 0.8, h + 1.1, cz + 0.6, { tile: [2, 2], color: [0.75, 0.76, 0.78] });
      else B.geo('metalDark', G.cyl, mat4(cx, h + 1.4, cz, 0, 1.8, 2.8, 1.8), [0.7, 0.7, 0.7]);
    }
    if (rnd() < 0.5) B.geo('metalDark', G.cyl6, mat4(R(x0 + 1, x1 - 1), h + 3, R(z0 + 1, z1 - 1), 0, 0.08, 6, 0.08));
  }
  function bldg(x0, z0, x1, z1, h, style, opt = {}) {
    const tile = style === 'brick' ? [4, 4] : [12, 12.8];
    B.box(style, x0, 0, z0, x1, h, z1, { tile, off: [Math.floor(R(0, 4)) / 4, 0], color: tints[style](), faces: F.sides });
    B.box('roof', x0, h - 0.01, z0, x1, h, z1, { tile: [6, 6], faces: F.py });
    B.box('concrete', x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.65, z1 + 0.06, { tile: [4, 4], faces: F.sides | F.py, color: [0.62, 0.62, 0.6] });
    B.box('concrete', x0 - 0.18, h - 0.3, z0 - 0.18, x1 + 0.18, h, z1 + 0.18, { tile: [4, 4], faces: F.sides | F.ny, color: [0.85, 0.84, 0.8] });
    if (!opt.noRoof) roofClutter(x0, z0, x1, z1, h);
    solid(x0, 0, z0, x1, h, z1, { mat: 'concrete' });
    mm.push({ x0, z0, x1, z1, t: 'bldg', h });
  }
  // fila de edificios con alturas variadas
  function row(x0, z0, x1, z1, alongX, minW, maxW, hmin, hmax) {
    const styles = ['facadeA', 'facadeB', 'facadeC'];
    if (alongX) { let x = x0; while (x < x1 - 0.1) { const w = Math.min(x1 - x, R(minW, maxW)); bldg(x, z0, x + w, z1, R(hmin, hmax), styles[RI(0, 2)]); x += w; } }
    else { let z = z0; while (z < z1 - 0.1) { const w = Math.min(z1 - z, R(minW, maxW)); bldg(x0, z, x1, z + w, R(hmin, hmax), styles[RI(0, 2)]); z += w; } }
  }
  function wallBox(key, x0, y0, z0, x1, y1, z1, tile, color, props = {}) {
    B.box(key, x0, y0, z0, x1, y1, z1, { tile: tile || [4, 4], color });
    const b = solid(x0, y0, z0, x1, y1, z1, Object.assign({ mat: key === 'metal' || key === 'metalDark' || key === 'container' || key === 'corrugated' ? 'metal' : key === 'wood' ? 'wood' : 'concrete' }, props));
    if (y1 - y0 > 0.7) mm.push({ x0, z0, x1, z1, t: y1 - y0 > 2 ? 'tall' : 'low', h: y1 - y0 });
    return b;
  }
  // Escaleras: n peldaños a lo largo de un eje. dir: 'x+','x-','z+','z-' (sentido de subida)
  function stairs(x0, z0, x1, z1, dir, n, rise, baseY = 0) {
    for (let k = 0; k < n; k++) {
      let a0, a1;
      if (dir === 'x+' || dir === 'x-') {
        const L = (x1 - x0) / n;
        if (dir === 'x+') { a0 = x0 + L * k; a1 = a0 + L; } else { a1 = x1 - L * k; a0 = a1 - L; }
        wallBox('concrete', a0, baseY, z0, a1, baseY + rise * (k + 1), z1, [2, 2], [0.78, 0.77, 0.74]);
      } else {
        const L = (z1 - z0) / n;
        if (dir === 'z+') { a0 = z0 + L * k; a1 = a0 + L; } else { a1 = z1 - L * k; a0 = a1 - L; }
        wallBox('concrete', x0, baseY, a0, x1, baseY + rise * (k + 1), a1, [2, 2], [0.78, 0.77, 0.74]);
      }
    }
  }
  // Habitación transitable con huecos de puerta / ventana
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.32, depthWrite: false });
  function room(o) {
    const { x0, z0, x1, z1, h } = o; const t = o.t || 0.3; const ext = o.ext, int = o.int || 'plaster';
    const extTile = ext === 'corrugated' ? [6, 6] : ext === 'brick' ? [4, 4] : [12, 12.8];
    const extCol = o.extColor || (tints[ext] ? tints[ext]() : [1, 1, 1]);
    const sides = {
      n: { a0: x0, a1: x1, fixed: [z0, z0 + t], axis: 'x', out: F.nz, in: F.pz },
      s: { a0: x0, a1: x1, fixed: [z1 - t, z1], axis: 'x', out: F.pz, in: F.nz },
      w: { a0: z0 + t, a1: z1 - t, fixed: [x0, x0 + t], axis: 'z', out: F.nx, in: F.px },
      e: { a0: z0 + t, a1: z1 - t, fixed: [x1 - t, x1], axis: 'z', out: F.px, in: F.nx },
    };
    const seg = (sd, a, b, y0, y1, glass) => {
      if (b - a < 0.01 || y1 - y0 < 0.01) return;
      const [f0, f1] = sd.fixed;
      const X0 = sd.axis === 'x' ? a : f0, X1 = sd.axis === 'x' ? b : f1, Z0 = sd.axis === 'x' ? f0 : a, Z1 = sd.axis === 'x' ? f1 : b;
      if (glass) {
        const gx0 = sd.axis === 'x' ? X0 : (f0 + f1) / 2 - 0.03, gx1 = sd.axis === 'x' ? X1 : (f0 + f1) / 2 + 0.03;
        const gz0 = sd.axis === 'x' ? (f0 + f1) / 2 - 0.03 : Z0, gz1 = sd.axis === 'x' ? (f0 + f1) / 2 + 0.03 : Z1;
        const pane = { idx: extras.breakGlass.length, position: new THREE.Vector3((gx0 + gx1) / 2, (y0 + y1) / 2, (gz0 + gz1) / 2), scale: new THREE.Vector3(gx1 - gx0, y1 - y0, gz1 - gz0), visible: true };
        const bx = solid(gx0, y0, gz0, gx1, y1, gz1, { mat: 'glass', sight: false, hp: 1, data: { type: 'glass', mesh: pane } });
        extras.breakGlass.push(bx);
        return;
      }
      B.box(ext, X0, y0, Z0, X1, y1, Z1, { tile: extTile, color: extCol, faces: sd.out });
      B.box(int, X0, y0, Z0, X1, y1, Z1, { tile: [4, 4], color: o.intColor || [0.85, 0.83, 0.8], faces: (F.all & ~sd.out) & ~F.ny });
      solid(X0, y0, Z0, X1, y1, Z1, { mat: ext === 'corrugated' ? 'metal' : 'concrete' });
    };
    for (const k of ['n', 's', 'w', 'e']) {
      const sd = sides[k]; const ops = (o.open && o.open[k] || []).slice().sort((p, q) => p.a - q.a);
      let cur = sd.a0;
      for (const op of ops) {
        seg(sd, cur, op.a, 0, h);
        if (op.type === 'door') { seg(sd, op.a, op.b, op.top || 2.4, h); }
        else { seg(sd, op.a, op.b, 0, op.bot || 1.0); seg(sd, op.a, op.b, op.top || 2.3, h); if (o.glass !== false) seg(sd, op.a, op.b, op.bot || 1.0, op.top || 2.3, true); }
        cur = op.b;
      }
      seg(sd, cur, sd.a1, 0, h);
    }
    // techo
    B.box(o.roofKey || 'roof', x0, h, z0, x1, h + 0.25, z1, { tile: [6, 6], faces: F.py | F.sides, color: [0.8, 0.8, 0.78] });
    B.box(int, x0, h, z0, x1, h + 0.25, z1, { tile: [4, 4], faces: F.ny, color: [0.7, 0.7, 0.68] });
    solid(x0, h, z0, x1, h + 0.25, z1, { mat: 'concrete' });
    ground(o.floor || 'floorInt', x0 + t, z0 + t, x1 - t, z1 - t, 0.012, 2);
    // luces de techo (emisivas)
    for (let x = x0 + 3; x < x1 - 2; x += 5) for (let z = z0 + 3; z < z1 - 2; z += 5) B.box('lamp', x - 0.6, h - 0.04, z - 0.15, x + 0.6, h, z + 0.15, { faces: F.ny });
    mm.push({ x0, z0, x1, z1, t: 'room' });
  }

  function crate(x, z, s = 1.1, y = 0, destructible = true) {
    if (destructible) {
      extras.crates.push({ x, y, z, s });
      const b = solid(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, { mat: 'wood', hp: 70, data: { type: 'crate', idx: extras.crates.length - 1 } });
      extras.crates[extras.crates.length - 1].box = b;
    } else {
      B.geo('wood', G.box, mat4(x, y + s / 2, z, 0, s, s, s));
      solid(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, { mat: 'wood' });
    }
    mm.push({ x0: x - s / 2, z0: z - s / 2, x1: x + s / 2, z1: z + s / 2, t: 'low' });
  }
  function barrel(x, z, explosive = false) {
    if (explosive) { extras.barrels.push({ x, z }); return; }
    B.geo('metal', G.cyl, mat4(x, 0.45, z, 0, 0.6, 0.9, 0.6), [0.22, 0.3, 0.42]);
    solid(x - 0.3, 0, z - 0.3, x + 0.3, 0.9, z + 0.3, { mat: 'metal' });
  }
  function sandbags(x0, z0, x1, z1, h = 1.05, y0 = 0) {
    const alongX = (x1 - x0) >= (z1 - z0);
    const L = alongX ? x1 - x0 : z1 - z0; const rows = Math.round(h / 0.26);
    for (let r = 0; r < rows; r++) {
      const n = Math.max(1, Math.round(L / 0.55)); const bl = L / n; const off = (r % 2) * bl * 0.5;
      for (let i = 0; i < n; i++) {
        const a = Math.min(L - bl, i * bl + off - (r % 2 ? bl * 0.5 : 0)); const c = R(0.55, 0.7);
        const y = y0 + r * 0.26;
        if (alongX) B.geo('dirt', G.box, mat4(x0 + a + bl / 2, y + 0.13, (z0 + z1) / 2, R(-0.05, 0.05), bl * 0.98, 0.26, (z1 - z0) * (0.92 - r * 0.04)), [c * 1.2, c * 1.1, c * 0.85], 0.3);
        else B.geo('dirt', G.box, mat4((x0 + x1) / 2, y + 0.13, z0 + a + bl / 2, R(-0.05, 0.05), (x1 - x0) * (0.92 - r * 0.04), 0.26, bl * 0.98), [c * 1.2, c * 1.1, c * 0.85], 0.3);
      }
    }
    solid(x0, y0, z0, x1, y0 + h, z1, { mat: 'dirt' });
    mm.push({ x0, z0, x1, z1, t: 'low' });
  }
  function jersey(x, z, alongX, L = 3) {
    const hw = 0.32;
    if (alongX) {
      B.box('concrete', x - L / 2, 0, z - hw, x + L / 2, 0.45, z + hw, { tile: [3, 3], color: [0.85, 0.84, 0.8] });
      B.box('concrete', x - L / 2, 0.45, z - 0.13, x + L / 2, 0.92, z + 0.13, { tile: [3, 3], color: [0.85, 0.84, 0.8] });
      solid(x - L / 2, 0, z - hw, x + L / 2, 0.92, z + hw);
      mm.push({ x0: x - L / 2, z0: z - hw, x1: x + L / 2, z1: z + hw, t: 'low' });
    } else {
      B.box('concrete', x - hw, 0, z - L / 2, x + hw, 0.45, z + L / 2, { tile: [3, 3], color: [0.85, 0.84, 0.8] });
      B.box('concrete', x - 0.13, 0.45, z - L / 2, x + 0.13, 0.92, z + L / 2, { tile: [3, 3], color: [0.85, 0.84, 0.8] });
      solid(x - hw, 0, z - L / 2, x + hw, 0.92, z + L / 2);
      mm.push({ x0: x - hw, z0: z - L / 2, x1: x + hw, z1: z + L / 2, t: 'low' });
    }
  }
  // transformación local→mundo para giros de 90°
  function lbox(cx, cz, rot, key, lx0, y0, lz0, lx1, y1, lz1, o) {
    const tr = (lx, lz) => rot === 0 ? [cx + lx, cz + lz] : rot === 1 ? [cx + lz, cz - lx] : rot === 2 ? [cx - lx, cz - lz] : [cx - lz, cz + lx];
    const a = tr(lx0, lz0), b = tr(lx1, lz1);
    B.box(key, Math.min(a[0], b[0]), y0, Math.min(a[1], b[1]), Math.max(a[0], b[0]), y1, Math.max(a[1], b[1]), o);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }
  const CAR_COLS = [[0.55, 0.08, 0.06], [0.1, 0.18, 0.35], [0.75, 0.75, 0.72], [0.12, 0.12, 0.13], [0.2, 0.3, 0.22], [0.6, 0.5, 0.25], [0.35, 0.36, 0.38]];
  function car(x, z, rot, burnt = false, col) {
    const c = burnt ? [0.09, 0.075, 0.065] : (col || CAR_COLS[RI(0, CAR_COLS.length - 1)]);
    lbox(x, z, rot, 'carPaint', -0.9, 0.32, -2.25, 0.9, 0.92, 2.25, { color: c });
    lbox(x, z, rot, burnt ? 'rubber' : 'glassDark', -0.8, 0.92, -1.1, 0.8, 1.38, 0.95, {});
    lbox(x, z, rot, 'carPaint', -0.82, 1.38, -1.0, 0.82, 1.46, 0.85, { color: c });
    lbox(x, z, rot, 'rubber', -0.92, 0.25, -2.32, 0.92, 0.5, -2.2, {});
    lbox(x, z, rot, 'rubber', -0.92, 0.25, 2.2, 0.92, 0.5, 2.32, {});
    if (!burnt) { lbox(x, z, rot, 'lamp', -0.8, 0.62, -2.27, -0.45, 0.75, -2.24, { faces: F.all }); lbox(x, z, rot, 'lamp', 0.45, 0.62, -2.27, 0.8, 0.75, -2.24, { faces: F.all }); }
    const ry = rot * Math.PI / 2;
    for (const [wx, wz] of [[-0.82, -1.4], [0.82, -1.4], [-0.82, 1.4], [0.82, 1.4]]) {
      const cs = Math.cos(ry), sn = Math.sin(ry);
      B.geo('rubber', G.cyl, mat4(x + wx * cs + wz * sn, 0.34, z - wx * sn + wz * cs, ry, 0.68, 0.26, 0.68, 0, Math.PI / 2));
    }
    const w = rot % 2 === 0 ? [0.92, 2.3] : [2.3, 0.92];
    solid(x - w[0], 0, z - w[1], x + w[0], 0.95, z + w[1], { mat: 'metal' });
    const w2 = rot % 2 === 0 ? [0.82, 1.05] : [1.05, 0.82];
    solid(x - w2[0], 0.95, z - w2[1], x + w2[0], 1.45, z + w2[1], { mat: 'metal', sight: !burnt ? false : true });
    mm.push({ x0: x - w[0], z0: z - w[1], x1: x + w[0], z1: z + w[1], t: 'car' });
    if (burnt && rnd() < 0.6) extras.fires.push({ x, y: 0.9, z, s: 0.8 });
  }
  function bus(x, z, alongZ = true, burnt = true) {
    const c = burnt ? [0.13, 0.1, 0.08] : [0.75, 0.6, 0.15];
    const rot = alongZ ? 0 : 1;
    lbox(x, z, rot, 'carPaint', -1.25, 0.4, -5.5, 1.25, 1.4, 5.5, { color: c });
    lbox(x, z, rot, burnt ? 'rubber' : 'glassDark', -1.24, 1.4, -5.3, 1.24, 2.4, 5.3, {});
    lbox(x, z, rot, 'carPaint', -1.25, 2.4, -5.5, 1.25, 3.0, 5.5, { color: c });
    for (const wz of [-3.8, 3.6]) for (const wx of [-1.15, 1.15]) {
      const px = alongZ ? x + wx : x + wz, pz = alongZ ? z + wz : z - wx;
      B.geo('rubber', G.cyl, mat4(px, 0.48, pz, alongZ ? 0 : Math.PI / 2, 0.96, 0.3, 0.96, 0, Math.PI / 2));
    }
    const w = alongZ ? [1.27, 5.52] : [5.52, 1.27];
    solid(x - w[0], 0, z - w[1], x + w[0], 3.0, z + w[1], { mat: 'metal' });
    mm.push({ x0: x - w[0], z0: z - w[1], x1: x + w[0], z1: z + w[1], t: 'car' });
    if (burnt) { extras.fires.push({ x, y: 1.5, z: z + (alongZ ? 2 : 0), s: 1.3 }); extras.smokeCols.push({ x, y: 3, z }); }
  }
  const CONT_COLS = [[0.62, 0.16, 0.1], [0.12, 0.3, 0.55], [0.2, 0.42, 0.25], [0.8, 0.45, 0.1], [0.55, 0.55, 0.52], [0.45, 0.12, 0.12], [0.1, 0.4, 0.45]];
  function container(x0, z0, alongX, len = 12.2, stack = 1) {
    const w = 2.44, hh = 2.6;
    const x1 = alongX ? x0 + len : x0 + w, z1 = alongX ? z0 + w : z0 + len;
    for (let s = 0; s < stack; s++) {
      const c = CONT_COLS[RI(0, CONT_COLS.length - 1)];
      B.box('container', x0, s * hh, z0, x1, (s + 1) * hh, z1, { tile: [6, 2.6], color: c });
    }
    solid(x0, 0, z0, x1, hh * stack, z1, { mat: 'metal' });
    mm.push({ x0, z0, x1, z1, t: 'cont', h: hh * stack });
  }
  function lamp(x, z, dirX, dirZ) {
    B.geo('metalDark', G.cyl6, mat4(x, 3.2, z, 0, 0.16, 6.4, 0.16));
    B.box('metalDark', Math.min(x, x + dirX * 1.6) - 0.05, 6.3, Math.min(z, z + dirZ * 1.6) - 0.05, Math.max(x, x + dirX * 1.6) + 0.05, 6.4, Math.max(z, z + dirZ * 1.6) + 0.05);
    const hx = x + dirX * 1.6, hz = z + dirZ * 1.6;
    B.box('metalDark', hx - 0.3, 6.15, hz - 0.18, hx + 0.3, 6.35, hz + 0.18);
    B.box('lamp', hx - 0.25, 6.13, hz - 0.14, hx + 0.25, 6.15, hz + 0.14, { faces: F.ny });
    solid(x - 0.12, 0, z - 0.12, x + 0.12, 6.4, z + 0.12, { mat: 'metal', sight: false });
    extras.lamps.push({ x: hx, y: 6.1, z: hz });
  }
  function tree(x, z, s = 1) {
    B.geo('trunk', G.cyl6, mat4(x, 1.6 * s, z, 0, 0.32 * s, 3.2 * s, 0.32 * s), [1, 1, 1], 1);
    for (let k = 0; k < 4; k++) {
      const g = R(0.6, 0.9);
      B.geo('foliage', G.ico, mat4(x + R(-0.9, 0.9) * s, (3.4 + R(0, 1.6)) * s, z + R(-0.9, 0.9) * s, R(0, 3), R(1.2, 1.8) * s, R(1.0, 1.5) * s, R(1.2, 1.8) * s), [0.22 * g, 0.36 * g, 0.16 * g]);
    }
    solid(x - 0.2, 0, z - 0.2, x + 0.2, 3.2 * s, z + 0.2, { mat: 'wood', sight: false });
    mm.push({ x0: x - 1.5, z0: z - 1.5, x1: x + 1.5, z1: z + 1.5, t: 'tree' });
  }
  function hedge(x0, z0, x1, z1, h = 1.15) {
    const g = R(0.75, 0.95);
    B.box('foliage', x0, 0, z0, x1, h, z1, { color: [0.2 * g, 0.33 * g, 0.15 * g] });
    for (let i = 0; i < Math.max(2, ((x1 - x0) + (z1 - z0)) / 1.5); i++) B.geo('foliage', G.ico, mat4(R(x0, x1), h, R(z0, z1), R(0, 3), 0.5, 0.35, 0.5), [0.22 * g, 0.36 * g, 0.16 * g]);
    solid(x0, 0, z0, x1, h, z1, { mat: 'wood' });
    mm.push({ x0, z0, x1, z1, t: 'low' });
  }
  function planter(x, z, s = 3) {
    B.box('concrete', x - s / 2, 0, z - s / 2, x + s / 2, 0.8, z + s / 2, { tile: [3, 3], color: [0.8, 0.79, 0.75] });
    B.box('dirt', x - s / 2 + 0.15, 0.8, z - s / 2 + 0.15, x + s / 2 - 0.15, 0.82, z + s / 2 - 0.15, { faces: F.py });
    solid(x - s / 2, 0, z - s / 2, x + s / 2, 0.8, z + s / 2);
    tree(x, z, 0.85);
  }
  function bench(x, z, alongX) {
    const L = 1.8;
    if (alongX) { B.box('wood', x - L / 2, 0.4, z - 0.25, x + L / 2, 0.45, z + 0.25, { tile: [1, 1] }); B.box('metalDark', x - L / 2 + 0.1, 0, z - 0.2, x - L / 2 + 0.2, 0.4, z + 0.2); B.box('metalDark', x + L / 2 - 0.2, 0, z - 0.2, x + L / 2 - 0.1, 0.4, z + 0.2); solid(x - L / 2, 0, z - 0.25, x + L / 2, 0.45, z + 0.25, { mat: 'wood', sight: false }); }
    else { B.box('wood', x - 0.25, 0.4, z - L / 2, x + 0.25, 0.45, z + L / 2, { tile: [1, 1] }); B.box('metalDark', x - 0.2, 0, z - L / 2 + 0.1, x + 0.2, 0.4, z - L / 2 + 0.2); B.box('metalDark', x - 0.2, 0, z + L / 2 - 0.2, x + 0.2, 0.4, z + L / 2 - 0.1); solid(x - 0.25, 0, z - L / 2, x + 0.25, 0.45, z + L / 2, { mat: 'wood', sight: false }); }
  }
  function dumpster(x, z, alongX) {
    const hw = alongX ? 0.95 : 0.65, hd = alongX ? 0.65 : 0.95;
    B.box('metal', x - hw, 0.15, z - hd, x + hw, 1.25, z + hd, { tile: [2, 2], color: [0.15, 0.3, 0.2] });
    B.box('metalDark', x - hw - 0.05, 1.25, z - hd - 0.05, x + hw + 0.05, 1.32, z + hd + 0.05);
    solid(x - hw, 0, z - hd, x + hw, 1.32, z + hd, { mat: 'metal' });
    mm.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd, t: 'low' });
  }
  function rubble(x, z, r = 1.5, n = 10) {
    for (let i = 0; i < n; i++) {
      const s = R(0.15, 0.55); const g = R(0.5, 0.8);
      B.geo(rnd() < 0.8 ? 'concrete' : 'metalDark', G.box, mat4(x + R(-r, r), s * 0.3, z + R(-r, r), R(0, 3), s, s * 0.6, s * R(0.6, 1.4), R(-0.4, 0.4), R(-0.4, 0.4)), [g, g, g * 0.95], 0.3);
    }
  }
  function tires(x, z) { for (let i = 0; i < 3; i++) B.geo('rubber', G.cyl, mat4(x, 0.12 + i * 0.24, z, 0, 0.75, 0.24, 0.75)); solid(x - 0.38, 0, z - 0.38, x + 0.38, 0.72, z + 0.38, { mat: 'wood' }); }
  function cone(x, z) { B.geo('cloth', G.cone, mat4(x, 0.35, z, 0, 0.36, 0.7, 0.36), [0.95, 0.35, 0.05]); }
  function pole(x, z) { B.geo('trunk', G.cyl6, mat4(x, 4.5, z, 0, 0.26, 9, 0.26)); B.box('trunk', x - 1.1, 8.2, z - 0.06, x + 1.1, 8.32, z + 0.06); solid(x - 0.14, 0, z - 0.14, x + 0.14, 9, z + 0.14, { mat: 'wood', sight: false }); return { x, z }; }
  function cable(a, b, y, sag = 1.0) {
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, y - Math.sin(t * Math.PI) * sag, a.z + (b.z - a.z) * t)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.025, 3, false);
    B.geo('rubber', g, new THREE.Matrix4()); g.dispose();
  }
  function stripe(x0, z0, x1, z1, col) { B.box('paint', x0, 0.03, z0, x1, 0.035, z1, { faces: F.py, color: col }); }
  function puddle(x, z, sx, sz) { B.geo('puddle', G.cyl, mat4(x, 0.028, z, R(0, 3), sx, 0.002, sz)); }

  // ------------------------------------------------------------- carteles (atlas)
  const SIGNS = [
    ['FARMACIA SOL', '#1d6b3a', '#f2f2ea'], ['TALLER RUIZ', '#2b2f36', '#f3c640'], ['HOTEL BRISA', '#5a1f2a', '#f4e6c8'],
    ['VARGA LOGÍSTICA', '#16324f', '#e8eef5'], ['MERCADO CENTRAL', '#6b3b16', '#f4e2b8'], ['AV. DEL PUERTO', '#1f4a8a', '#ffffff'],
    ['CAFÉ OLIVO', '#2f3b23', '#e9e3c6'], ['PROHIBIDO EL PASO', '#b51f1f', '#ffffff'],
  ];
  const atlas = document.createElement('canvas'); atlas.width = 1024; atlas.height = 1024;
  {
    const ctx = atlas.getContext('2d');
    SIGNS.forEach(([txt, bg, fg], i) => {
      const y = i * 128; ctx.fillStyle = bg; ctx.fillRect(0, y, 1024, 128);
      ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.strokeRect(10, y + 10, 1004, 108);
      ctx.fillStyle = fg; ctx.font = '700 76px Rajdhani, "Arial Narrow", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, 512, y + 68, 960);
      for (let k = 0; k < 300; k++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.3})`; ctx.fillRect(Math.random() * 1024, y + Math.random() * 128, 2 + Math.random() * 8, 1 + Math.random() * 3); }
    });
  }
  M.signs.map = tex(atlas, true, false);
  // cartel en pared: side = dirección normal ('n','s','e','w')
  function sign(i, cx, y, cz, side, w = 4, h = 0.6) {
    const v0 = 1 - (i + 1) / 8 + 0.004, v1 = 1 - i / 8 - 0.004;
    const uv = [[0, v0], [1, v0], [1, v1], [0, v1]];
    const d = 0.08;
    if (side === 's') B.plane('signs', [cx - w / 2, y, cz + d], [cx + w / 2, y, cz + d], [cx + w / 2, y + h, cz + d], [cx - w / 2, y + h, cz + d], [0, 0, 1], uv);
    else if (side === 'n') B.plane('signs', [cx + w / 2, y, cz - d], [cx - w / 2, y, cz - d], [cx - w / 2, y + h, cz - d], [cx + w / 2, y + h, cz - d], [0, 0, -1], uv);
    else if (side === 'e') B.plane('signs', [cx + d, y, cz + w / 2], [cx + d, y, cz - w / 2], [cx + d, y + h, cz - w / 2], [cx + d, y + h, cz + w / 2], [1, 0, 0], uv);
    else B.plane('signs', [cx - d, y, cz - w / 2], [cx - d, y, cz + w / 2], [cx - d, y + h, cz + w / 2], [cx - d, y + h, cz - w / 2], [-1, 0, 0], uv);
  }

  // ============================================================= SUELO
  ground('tiles', minX, minZ, maxX, maxZ, 0, 4, [0.92, 0.9, 0.87]);
  // calles
  const ROAD = (x0, z0, x1, z1) => ground('asphalt', x0, z0, x1, z1, 0.015, 8);
  ROAD(-74, -58, 74, -46); ROAD(-74, 46, 74, 58);
  ROAD(-7, -46, 7, 46);
  ROAD(-34, -46, -26, 46); ROAD(26, -46, 34, 46);
  ROAD(-26, -24, -7, -18); ROAD(7, -24, 26, -18); ROAD(-26, 18, -7, 24); ROAD(7, 18, 26, 24);
  // patio de contenedores y zona de carga (tierra/grava)
  ground('dirt', 34, -46, 74, -10, 0.015, 6, [0.85, 0.82, 0.78]);
  ground('concrete', 34, -10, 74, 20, 0.015, 4, [0.78, 0.77, 0.74]);
  ground('asphalt', 34, 20, 74, 46, 0.015, 8, [1.05, 1.05, 1.05]);
  // parque
  ground('grass', -74, 20, -36, 44, 0.015, 6);
  ground('dirt', -58, 20, -54, 44, 0.025, 4, [1, 0.95, 0.85]);
  ground('dirt', -74, 30, -36, 33, 0.026, 4, [1, 0.95, 0.85]);
  // marcas viales
  for (let z = -44; z < 44; z += 6) if (z > 18 || z + 3 < -18) stripe(-0.12, z, 0.12, z + 3, [0.9, 0.75, 0.2]);
  for (let x = -72; x < 72; x += 6) { stripe(x, -52.12, x + 3, -51.88, [0.95, 0.95, 0.92]); stripe(x, 51.88, x + 3, 52.12, [0.95, 0.95, 0.92]); }
  for (let z = -44; z < 44; z += 6) { stripe(-30.12, z, -29.88, z + 3, [0.95, 0.95, 0.92]); stripe(29.88, z, 30.12, z + 3, [0.95, 0.95, 0.92]); }
  // pasos de cebra
  for (const [cx, cz, alongX] of [[0, -44, true], [0, 44, true], [-30, -44, true], [30, -44, true], [-30, 44, true], [30, 44, true], [-24, -21, false], [24, -21, false], [-24, 21, false], [24, 21, false]]) {
    for (let k = -3; k <= 3; k++) {
      if (alongX) stripe(cx + k * 0.9 - 0.25, cz - 1.5, cx + k * 0.9 + 0.25, cz + 1.5, [0.92, 0.92, 0.9]);
      else stripe(cx - 1.5, cz + k * 0.9 - 0.25, cx + 1.5, cz + k * 0.9 + 0.25, [0.92, 0.92, 0.9]);
    }
  }
  // plazas de aparcamiento
  for (let x = 38; x < 72; x += 3) { stripe(x, 38, x + 0.12, 44, [0.9, 0.9, 0.88]); stripe(x, 22, x + 0.12, 27, [0.9, 0.9, 0.88]); }
  // charcos
  for (let i = 0; i < 26; i++) { const p = [[R(-70, 70), R(-56, -48)], [R(-70, 70), R(48, 56)], [R(-6, 6), R(-44, 44)], [R(36, 72), R(-44, -12)]][i % 4]; puddle(p[0], p[1], R(1.5, 4), R(1, 3)); }

  // ============================================================= PERÍMETRO
  row(-80, -64, 80, -58, true, 12, 22, 10, 22);
  row(-80, 58, 80, 64, true, 12, 22, 10, 22);
  row(-80, -58, -74, 58, false, 10, 18, 9, 18);
  row(74, -58, 80, 58, false, 10, 18, 9, 18);

  // ============================================================= MANZANAS INTERIORES
  bldg(-26, -46, -17, -26, 14, 'facadeA'); bldg(-14, -46, -7, -30, 10, 'facadeB');
  bldg(17, -46, 26, -26, 16, 'facadeC'); bldg(7, -46, 14, -30, 11, 'facadeB');
  bldg(-26, 26, -17, 46, 12, 'facadeB'); bldg(-14, 30, -7, 46, 15, 'facadeA');
  bldg(17, 26, 26, 46, 13, 'facadeC'); bldg(7, 30, 14, 46, 10, 'facadeA');
  sign(0, -21.5, 3.2, -26, 's', 5); sign(2, 21.5, 3.6, -26, 's', 6); sign(1, -21.5, 3.2, 26, 'n', 5); sign(6, 10.5, 3.0, 30, 'n', 5);
  // patios traseros (callejones)
  dumpster(-10, -27, true); crate(-12.5, -25.5); crate(-8.2, -25.2); barrel(-15.5, -33); barrel(-15.6, -38.5, true); rubble(-15.5, -42, 1, 8);
  dumpster(10, -27, true); crate(12.5, -25.5); barrel(15.5, -36); tires(15.5, -40.5); rubble(15.5, -31, 1, 8);
  dumpster(-10, 27.5, true); crate(-12.2, 25.5); barrel(-15.6, 34, true); tires(-15.4, 39);
  dumpster(10, 27.5, true); crate(12.3, 25.6, 1.1); crate(12.3, 25.6, 1.1, 1.1); barrel(15.5, 35); rubble(15.5, 41, 1, 8);

  // ============================================================= PLAZA CENTRAL (B)
  ground('tiles', -26, -18, 26, 18, 0.02, 3, [0.98, 0.95, 0.9]);
  // monumento
  wallBox('concrete', -2.6, 0, -2.6, 2.6, 1.25, 2.6, [3, 3], [0.82, 0.8, 0.76]);
  wallBox('concrete', -0.8, 1.25, -0.8, 0.8, 7.5, 0.8, [3, 3], [0.75, 0.73, 0.7]);
  B.geo('metal', G.ico, mat4(0, 8.4, 0, 0, 0.9, 1.1, 0.9), [0.45, 0.38, 0.22]);
  B.geo('metal', G.cone, mat4(0, 9.6, 0, 0, 0.3, 1.4, 0.3), [0.45, 0.38, 0.22]);
  // jardineras y muros bajos
  planter(-12, -10); planter(12, 10); planter(-12, 10); planter(12, -12.5, 2.5);
  wallBox('concrete', -20, 0, 12.5, -14, 1.0, 13.1, [3, 3], [0.8, 0.79, 0.75]);
  wallBox('concrete', 14, 0, -13.1, 20, 1.0, -12.5, [3, 3], [0.8, 0.79, 0.75]);
  wallBox('concrete', -21, 0, -6, -20.4, 1.0, 0, [3, 3], [0.8, 0.79, 0.75]);
  wallBox('concrete', 20.4, 0, 2, 21, 1.0, 8, [3, 3], [0.8, 0.79, 0.75]);
  bench(-16, 4, true); bench(16, -4, true); bench(-8.5, 15.5, true); bench(8.5, -15.5, true);
  sandbags(-19, -9, -16, -8.4); sandbags(-19.6, -11.6, -19, -8.4);
  sandbags(16, 8.4, 19, 9); sandbags(19, 8.4, 19.6, 11.6);
  sandbags(-3, -6.2, 3, -5.6); sandbags(-3, 5.6, 3, 6.2);
  // café (interior)
  room({ x0: 14, z0: -10, x1: 22, z1: -3, h: 3.3, ext: 'brick', int: 'plaster', open: { s: [{ a: 16.5, b: 18.3, type: 'door' }], w: [{ a: -8.5, b: -5.5, type: 'window', bot: 1.0, top: 2.4 }], n: [{ a: 18.5, b: 21, type: 'window', bot: 1.0, top: 2.4 }] } });
  sign(6, 19.8, 2.5, -3, 's', 2.6, 0.5);
  wallBox('wood', 15, 0, -9.5, 17.5, 1.05, -8.8, [1, 1], [0.7, 0.6, 0.5]);
  wallBox('wood', 19.5, 0, -7, 21, 0.75, -5.5, [1, 1], [0.7, 0.55, 0.45]);
  // parada de autobús
  B.box('metalDark', -22.5, 0, 14.6, -22.4, 2.6, 14.7); B.box('metalDark', -17.6, 0, 14.6, -17.5, 2.6, 14.7);
  B.box('glassDark', -22.5, 0.4, 14.95, -17.5, 2.4, 15.0, { faces: F.all });
  B.box('metalDark', -22.7, 2.6, 14.4, -17.3, 2.7, 15.6);
  solid(-22.5, 0.4, 14.93, -17.5, 2.4, 15.02, { mat: 'metal', sight: false });
  // vehículos en la avenida
  bus(3.2, -36, true, true);
  car(-4, -40, 0, true); car(-3.5, -28, 1, false); car(4, -23.2, 0, false);
  car(-3.8, 26, 0, false); car(3.5, 33, 1, true); car(-2, 40, 0, false);
  jersey(-5, -19.5, true); jersey(5.5, -19.5, true); jersey(-5, 19.5, true); jersey(1, 19.5, true);
  // cruces
  car(-20, -21, 1, false); car(19, 21, 1, true); car(-30, -10, 0, false); car(29.5, 8, 0, true);
  car(-29, 30, 0, false); car(30.5, -34, 0, false);
  jersey(-30, 0, true, 3); jersey(30, -2, true, 3);

  // ============================================================= OESTE: MERCADO (sitio B en Sabotaje)
  // nave del mercado (sólida) con zona secreta
  bldg(-74, -46, -62, -27, 9, 'facadeB', { noRoof: false });
  bldg(-74, -21, -62, -14, 9, 'facadeB');
  // pasaje secreto: zona entre -27 y -21 con muros y techo
  room({ x0: -74, z0: -27, x1: -62, z1: -21, h: 3.0, ext: 'brick', int: 'plaster', glass: false, open: { e: [{ a: -24.6, b: -23.4, type: 'door', top: 2.2 }] } });
  B.box('facadeB', -74, 3.25, -27, -62, 9, -21, { tile: [12, 12.8], faces: F.px, color: [0.85, 0.82, 0.75] });
  solid(-74, 3.25, -27, -62, 9, -21);
  rubble(-63.2, -22.2, 0.6, 6);
  extras.supplies.push({ x: -71, z: -24, kind: 'cache' });
  sign(4, -62, 4.5, -34, 'e', 7, 1.0);
  // puestos del mercado
  const stall = (x, z, col) => {
    wallBox('wood', x - 1.6, 0, z - 0.6, x + 1.6, 1.0, z + 0.6, [1, 1], [0.8, 0.7, 0.6]);
    for (const [dx, dz] of [[-1.55, -1.4], [1.55, -1.4], [-1.55, 1.2], [1.55, 1.2]]) B.box('metalDark', x + dx - 0.04, 0, z + dz - 0.04, x + dx + 0.04, 2.6, z + dz + 0.04);
    B.box('cloth', x - 1.8, 2.5, z - 1.7, x + 1.8, 2.62, z + 1.5, { color: col });
    crate(x + R(-1, 1), z + 1.9, 0.8, 0, false);
  };
  const SC = [[0.7, 0.2, 0.15], [0.2, 0.4, 0.6], [0.75, 0.6, 0.2], [0.3, 0.5, 0.3], [0.6, 0.6, 0.6]];
  stall(-56, -38, SC[0]); stall(-48, -38, SC[1]); stall(-40, -36, SC[2]);
  stall(-56, -28, SC[3]); stall(-40, -27, SC[4]); stall(-56, -18, SC[1]); stall(-46, -14, SC[2]);
  crate(-49, -24); crate(-47.9, -24); crate(-49, -24, 1.1, 1.1); barrel(-44, -22); barrel(-43.4, -22.7, true);
  crate(-52.5, -31); barrel(-36.5, -40); barrel(-37.2, -40.6);
  // muro norte del mercado con huecos
  wallBox('brick', -62, 0, -45.6, -54, 1.6, -45.1, [4, 4]); wallBox('brick', -50, 0, -45.6, -42, 1.6, -45.1, [4, 4]);
  wallBox('brick', -38.5, 0, -45.6, -35, 1.6, -45.1, [4, 4]);
  // edificio entre mercado y calle oeste
  bldg(-42, -12, -36, -8, 6, 'facadeA');

  // ============================================================= OESTE: EDIFICIO BRISA (oficinas + azotea) y plazoleta (C)
  room({
    x0: -72, z0: -4, x1: -50, z1: 14, h: 3.6, ext: 'facadeC', int: 'plaster',
    open: {
      e: [{ a: 3, b: 5, type: 'door' }, { a: -2, b: 1, type: 'window' }, { a: 7, b: 10, type: 'window' }, { a: 11, b: 13, type: 'window' }],
      n: [{ a: -63, b: -61, type: 'door' }, { a: -58, b: -55, type: 'window' }, { a: -70, b: -67, type: 'window' }],
      s: [{ a: -67, b: -65, type: 'door' }, { a: -64, b: -61, type: 'window' }],
      w: [{ a: 2, b: 6, type: 'window' }],
    },
  });
  sign(2, -66, 2.5, 14, 's', 3.6, 0.55);
  // interior: mesas, mamparas y pilares
  for (const [x, z] of [[-68, 0], [-68, 4], [-64, 0], [-64, 4], [-68, 9], [-64, 9]]) {
    wallBox('wood', x - 0.9, 0, z - 0.45, x + 0.9, 0.78, z + 0.45, [1, 1], [0.6, 0.5, 0.42]);
  }
  wallBox('plaster', -60, 0, 6.5, -55, 1.5, 6.7, [4, 4], [0.6, 0.62, 0.66]);
  wallBox('plaster', -60, 0, -0.2, -59.8, 1.5, 3.5, [4, 4], [0.6, 0.62, 0.66]);
  wallBox('concrete', -61.3, 0, 2.2, -60.7, 3.6, 2.8, [2, 2]); wallBox('concrete', -56.3, 0, 2.2, -55.7, 3.6, 2.8, [2, 2]);
  wallBox('wood', -54.5, 0, 9, -52, 1.1, 12.5, [1, 1], [0.45, 0.35, 0.3]);
  // escalera exterior a la azotea (sube hacia el oeste)
  stairs(-58.05, 14, -52, 16, 'x-', 11, 0.35);
  B.box('concrete', -59.5, 0, 14, -58.05, 3.85, 16, { tile: [2, 2], color: [0.78, 0.77, 0.74] });
  solid(-59.5, 0, 14, -58.05, 3.85, 16);
  // parapeto de la azotea (con hueco en la llegada de la escalera)
  const ph = 4.85;
  wallBox('concrete', -72, 3.85, -4, -50, ph, -3.75, [4, 4]);
  wallBox('concrete', -72, 3.85, 13.75, -59.5, ph, 14, [4, 4]);
  wallBox('concrete', -56.5, 3.85, 13.75, -50, ph, 14, [4, 4]);
  wallBox('concrete', -72, 3.85, -3.75, -71.75, ph, 13.75, [4, 4]);
  wallBox('concrete', -50.25, 3.85, -3.75, -50, ph, 13.75, [4, 4]);
  wallBox('metal', -66, 3.85, 2, -64, 5.0, 4.5, [2, 2], [0.75, 0.76, 0.78]);
  wallBox('metal', -60, 3.85, 8, -58.5, 4.95, 10, [2, 2], [0.75, 0.76, 0.78]);
  sandbags(-53.6, -0.5, -53, 3, 0.8, 3.85); // posición de tirador en la azotea
  // plazoleta Brisa
  wallBox('concrete', -46, 0, -1, -45.4, 1.0, 4, [3, 3]); wallBox('concrete', -40, 0, 6, -36, 1.0, 6.6, [3, 3]);
  car(-43, 10, 1, true); planter(-38, -2, 2.6); bench(-46, 9, false); barrel(-47.5, 13, true); crate(-37.5, 12); crate(-37.5, 13.1);
  jersey(-48.5, 0, false, 3);
  bldg(-50, 16.5, -42, 19.5, 4.5, 'facadeA');

  // ============================================================= OESTE: PARQUE
  for (const [x, z] of [[-70, 24], [-64, 27], [-50, 24], [-44, 27], [-68, 38], [-65, 41.5], [-47, 38], [-40, 41], [-48, 28.6], [-40, 23]]) tree(x, z, R(0.9, 1.25));
  hedge(-70, 34.5, -62, 35.4); hedge(-52, 34.5, -44, 35.4); hedge(-66, 28.5, -65.1, 31); hedge(-45, 22, -44.1, 26);
  bench(-56, 37, false); bench(-52, 28, false); bench(-60, 24, false);
  // pabellón
  for (const [x, z] of [[-60, 36.5], [-52, 36.5], [-60, 42.5], [-52, 42.5]]) wallBox('concrete', x - 0.25, 0, z - 0.25, x + 0.25, 3.4, z + 0.25, [2, 2]);
  B.box('roof', -61, 3.4, 35.5, -51, 3.7, 43.5, { tile: [4, 4], color: [0.55, 0.4, 0.32] });
  solid(-61, 3.4, 35.5, -51, 3.7, 43.5);
  wallBox('concrete', -74, 0, 44.4, -60, 0.9, 45, [3, 3]); wallBox('concrete', -54, 0, 44.4, -36, 0.9, 45, [3, 3]);
  wallBox('concrete', -37, 0, 20, -36.4, 0.9, 30, [3, 3]); wallBox('concrete', -37, 0, 34, -36.4, 0.9, 44.4, [3, 3]);
  // estatua del parque
  wallBox('concrete', -57.2, 0, 31, -54.8, 1.4, 32.6, [2, 2]);
  B.geo('metal', G.ico, mat4(-56, 2.2, 31.8, 0, 0.5, 0.8, 0.5), [0.3, 0.38, 0.32]);

  // ============================================================= ESTE: PATIO DE CONTENEDORES (sitio A)
  container(38, -43, true, 12.2, 1); container(52, -43, true, 12.2, 2); container(66, -43.5, true, 6.06, 1);
  container(36.5, -35, true, 6.06, 1); container(46, -35, true, 12.2, 1); container(62, -35, true, 6.06, 2);
  container(40, -20, true, 12.2, 1); container(58, -20, true, 12.2, 2);
  container(70.5, -38, false, 12.2, 1); container(66.5, -29.5, false, 6.06, 1);
  container(46.5, -29.6, false, 6.06, 1);
  // escalera a la cima de un contenedor (posición elevada)
  stairs(36, -20, 40, -17.56, 'x+', 8, 0.325);
  crate(54, -24.5); crate(55.1, -24.5); crate(61, -30.5); crate(61, -29.4); barrel(57, -31); barrel(64.5, -27, true); barrel(49.5, -24, true);
  tires(64, -22.5); cone(52, -30); cone(53, -30.4); rubble(60, -26, 1.2, 8);
  // grúa pórtico
  for (const [x, z] of [[37.2, -39.5], [37.2, -22.5], [73.2, -39.5], [73.2, -22.5]]) wallBox('metal', x - 0.5, 0, z - 0.5, x + 0.5, 18, z + 0.5, [2, 2], [0.85, 0.6, 0.1]);
  B.box('metal', 36.6, 17, -40.1, 73.8, 18.6, -38.9, { tile: [2, 2], color: [0.85, 0.6, 0.1] });
  B.box('metal', 36.6, 17, -23.1, 73.8, 18.6, -21.9, { tile: [2, 2], color: [0.85, 0.6, 0.1] });
  B.box('metal', 52, 15.2, -39.5, 56, 17, -22.5, { tile: [2, 2], color: [0.7, 0.5, 0.1] });
  // valla norte del patio
  for (const [a, b] of [[36, 44], [48, 60], [64, 74]]) {
    wallBox('corrugated', a, 0, -45.95, b, 2.4, -45.8, [6, 6], [0.55, 0.58, 0.6]);
    for (let x = a; x <= b; x += 4) B.box('metalDark', x - 0.06, 0, -46.05, x + 0.06, 2.5, -45.7);
  }
  sign(7, 46, 1.2, -45.95, 'n', 3, 0.5);

  // ============================================================= ESTE: ALMACÉN VARGA (A en Dominio) + muelle
  room({
    x0: 46, z0: -6, x1: 72, z1: 16, h: 8, ext: 'corrugated', int: 'corrugated', t: 0.35, extColor: [0.55, 0.6, 0.62], intColor: [0.5, 0.5, 0.5],
    open: {
      w: [{ a: 8, b: 13, type: 'door', top: 4.5 }],
      s: [{ a: 56, b: 59, type: 'door', top: 3 }],
      n: [{ a: 60, b: 63, type: 'door', top: 3 }, { a: 49, b: 51.5, type: 'door', top: 3 }],
    },
    floor: 'concrete',
  });
  sign(3, 59, 6, -6, 'n', 9, 1.3);
  // estanterías
  const rack = (x0, z0, x1, z1) => {
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 3) { B.box('metal', x - 0.06, 0, z0, x + 0.06, 3.2, z0 + 0.1, { color: [0.2, 0.3, 0.6] }); B.box('metal', x - 0.06, 0, z1 - 0.1, x + 0.06, 3.2, z1, { color: [0.2, 0.3, 0.6] }); }
    for (const y of [0.15, 1.2, 2.3]) {
      B.box('metal', x0, y, z0, x1, y + 0.08, z1, { color: [0.8, 0.45, 0.1] });
      for (let x = x0 + 0.2; x < x1 - 1; x += R(1.2, 1.8)) B.box('cardboard', x, y + 0.08, z0 + 0.1, x + R(0.8, 1.2), y + 0.08 + R(0.5, 0.85), z1 - 0.1, { tile: [1, 1], color: [R(0.8, 1), R(0.75, 0.9), R(0.6, 0.75)] });
    }
    solid(x0, 0, z0, x1, 3.2, z1, { mat: 'metal' });
    mm.push({ x0, z0, x1, z1, t: 'tall' });
  };
  rack(50, -3.5, 57, -2.3); rack(61, -3.5, 69, -2.3); rack(50, 12, 57, 13.2); rack(63, 12, 70, 13.2);
  rack(64, 2, 70, 3.2); rack(64, 7, 70, 8.2);
  crate(53, 5); crate(54.1, 5); crate(53, 5, 1.1, 1.1); crate(58, 9.5); crate(60, 0.8); crate(51.5, 8.6);
  barrel(56, 2); barrel(56.7, 2.5); barrel(57.2, 1.8, true);
  // carretilla elevadora
  wallBox('metal', 59.5, 0, 5.5, 61, 1.5, 7.8, [1, 1], [0.85, 0.65, 0.1]);
  B.box('metalDark', 59.6, 1.5, 6.6, 60.9, 2.4, 7.7); B.box('metalDark', 59.4, 0, 4.4, 59.55, 2.6, 5.5); B.box('metalDark', 60.95, 0, 4.4, 61.1, 2.6, 5.5);
  // muelle de carga
  wallBox('concrete', 42, 0, -5, 46, 1.2, 6, [2, 2], [0.7, 0.69, 0.66]);
  stairs(42.5, 6, 45.5, 8, 'z-', 4, 0.3);
  stairs(42.5, -7, 45.5, -5, 'z+', 4, 0.3);
  crate(43, -3, 1.1, 1.2); crate(44.1, -3, 1.1, 1.2);
  B.box('rubber', 45.9, 0.3, -4, 46.0, 1.1, -2.5); B.box('rubber', 45.9, 0.3, 2, 46.0, 1.1, 3.5);
  // explanada
  tires(38, -6); crate(39, 14); crate(39, 15.1); crate(40.1, 14); jersey(37, 4, false, 3); dumpster(40, -8.5, true);
  wallBox('wood', 38, 0, 9, 39.2, 0.4, 10.2, [1, 1], [0.7, 0.6, 0.45]);

  // ============================================================= ESTE: GASOLINERA Y APARCAMIENTO
  for (const [x, z] of [[52, 29], [64, 29], [52, 35], [64, 35]]) wallBox('concrete', x - 0.3, 0, z - 0.3, x + 0.3, 5, z + 0.3, [2, 2], [0.9, 0.9, 0.9]);
  B.box('metal', 49, 5, 27, 67, 5.6, 37, { tile: [4, 4], color: [0.85, 0.85, 0.85] });
  B.box('paint', 49, 5.05, 26.98, 67, 5.55, 27, { color: [0.75, 0.12, 0.1], faces: F.nz });
  solid(49, 5, 27, 67, 5.6, 37);
  for (const [x, z] of [[55, 32], [61, 32]]) { wallBox('concrete', x - 0.6, 0, z - 1.6, x + 0.6, 0.2, z + 1.6, [2, 2]); wallBox('metal', x - 0.35, 0.2, z - 0.6, x + 0.35, 1.8, z + 0.6, [1, 1], [0.85, 0.85, 0.85]); }
  bldg(66, 37, 73, 44, 4.2, 'facadeA');
  sign(1, 69.5, 3.0, 37, 'n', 5);
  for (const x of [40, 46.5, 58]) car(x, 41, 0, rnd() < 0.3);
  for (const x of [43, 55, 67]) car(x, 24.5, 0, rnd() < 0.3);
  car(48, 32, 1, false); jersey(36, 33, false, 3); barrel(37.5, 22.5, true); dumpster(72, 30, false);

  // ============================================================= CALLES DE DESPLIEGUE (coberturas)
  // sur (VANGUARDIA)
  jersey(-50, 49, true); jersey(-35, 50, true); jersey(-15, 49.5, true); jersey(12, 49.5, true); jersey(36, 50, true); jersey(55, 49, true);
  car(-62, 53, 1, false); car(-24, 55, 1, false); car(24, 55, 1, true); car(62, 53, 1, false);
  crate(-5, 55.5); crate(5, 55.5); sandbags(-2, 48.5, 2, 49.1);
  // norte (CUERVO)
  jersey(-50, -49, true); jersey(-35, -50, true); jersey(-15, -49.5, true); jersey(12, -49.5, true); jersey(36, -50, true); jersey(55, -49, true);
  car(-62, -53, 1, true); car(-24, -55, 1, false); car(24, -55, 1, false); car(62, -53, 1, true);
  crate(-5, -55.5); crate(5, -55.5); sandbags(-2, -49.1, 2, -48.5);

  // ============================================================= FAROLAS, POSTES, CABLES
  for (let x = -66; x <= 66; x += 22) { if (Math.abs(x) > 8) lamp(x, -46.6, 0, -1); if (Math.abs(x + 11) < 70) lamp(x + 11, 46.6, 0, 1); }
  for (const z of [-40, -28, 28, 40]) { lamp(-6.6, z, 1, 0); lamp(6.6, z + 5, -1, 0); }
  for (const z of [-36, -12, 12, 36]) { lamp(-26.6, z, -1, 0); if (z + 12 < 44) lamp(26.6, z + 12, 1, 0); }
  const pN = [], pS = [];
  for (let x = -70; x <= 70; x += 20) { pN.push(pole(x, -57.4)); if (x + 10 <= 70) pS.push(pole(x + 10, 57.4)); }
  for (let i = 0; i < pN.length - 1; i++) { cable(pN[i], pN[i + 1], 8.25, 0.9); cable(pN[i], pN[i + 1], 7.8, 1.1); }
  for (let i = 0; i < pS.length - 1; i++) { cable(pS[i], pS[i + 1], 8.25, 0.9); cable(pS[i], pS[i + 1], 7.8, 1.1); }
  // cables cruzando calles entre edificios
  for (const [a, b, y] of [[{ x: -26, z: -35 }, { x: -34, z: -35 }, 9], [{ x: 26, z: -32 }, { x: 34, z: -30 }, 8], [{ x: -7, z: 35 }, { x: 7, z: 38 }, 9], [{ x: -7, z: -38 }, { x: 7, z: -36 }, 9.5]]) cable(a, b, y, 1.2);
  // escombros dispersos
  for (let i = 0; i < 18; i++) rubble(R(-70, 70), R(-56, 56), R(0.6, 1.4), RI(4, 9));
  for (let i = 0; i < 8; i++) { cone(R(-6, 6), R(-44, 44)); }

  // ============================================================= MALLA ESTÁTICA
  const shadowCfg = { paint: { cast: false, receive: true }, puddle: { cast: false, receive: true }, asphalt: { cast: false, receive: true }, tiles: { cast: false, receive: true }, dirt: { cast: true, receive: true }, grass: { cast: false, receive: true }, floorInt: { cast: false, receive: true }, signs: { cast: false, receive: true }, lamp: { cast: false, receive: false } };
  const staticGroup = B.build(M, shadowCfg);
  group.add(staticGroup);

  // ------------------------------------------------------------- destructibles: cajas instanciadas
  const crateMat = new THREE.MeshStandardMaterial({ map: T.wood.map, normalMap: T.wood.normalMap, roughness: 0.85 });
  const crateMesh = new THREE.InstancedMesh(G.box, crateMat, Math.max(1, extras.crates.length));
  crateMesh.castShadow = true; crateMesh.receiveShadow = true;
  extras.crates.forEach((c, i) => { crateMesh.setMatrixAt(i, mat4(c.x, c.y + c.s / 2, c.z, R(-0.05, 0.05), c.s, c.s, c.s)); });
  crateMesh.instanceMatrix.needsUpdate = true;
  group.add(crateMesh);
  // cristales destructibles (instanciados)
  const glassMesh = new THREE.InstancedMesh(G.box, glassMat, Math.max(1, extras.breakGlass.length));
  glassMesh.renderOrder = 2;
  extras.breakGlass.forEach((bx, i) => { const p = bx.data.mesh; glassMesh.setMatrixAt(i, new THREE.Matrix4().compose(p.position, new THREE.Quaternion(), p.scale)); });
  glassMesh.instanceMatrix.needsUpdate = true; group.add(glassMesh);
  // barriles explosivos (instanciados)
  const barrelMat = new THREE.MeshStandardMaterial({ map: T.metal.map, color: 0xb3261b, roughness: 0.5, metalness: 0.5 });
  const barrelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14);
  const barrelMesh = new THREE.InstancedMesh(barrelGeo, barrelMat, Math.max(1, extras.barrels.length));
  barrelMesh.castShadow = true; barrelMesh.receiveShadow = true;
  extras.barrels.forEach((b, i) => {
    barrelMesh.setMatrixAt(i, mat4(b.x, 0.45, b.z, R(0, 3)));
    b.idx = i; b.mesh = { position: new THREE.Vector3(b.x, 0.45, b.z) };
    b.box = solid(b.x - 0.3, 0, b.z - 0.3, b.x + 0.3, 0.9, b.z + 0.3, { mat: 'metal', hp: 22, data: { type: 'barrel', ref: b } });
  });
  barrelMesh.instanceMatrix.needsUpdate = true; group.add(barrelMesh);

  // ============================================================= NAVEGACIÓN
  const nav = new Nav(W, minX, minZ, maxX, maxZ, 1);
  const seeds = [{ x: 0, z: 52 }, { x: 0, z: -52 }, { x: 0, z: 10 }, { x: 59, z: 5 }, { x: -60, z: 5 }, { x: 54, z: -27 }, { x: -48, z: -20 }, { x: -55, z: 30 }, { x: 60, z: 40 }];
  nav.build(seeds);

  // ============================================================= PUNTOS DE JUEGO
  const spawns = { 0: [], 1: [], ffa: [] };
  for (const x of [-60, -45, -30, -18, -8, 0, 8, 18, 30, 45, 60]) { spawns[0].push({ x, z: 53 + R(-1.5, 2), yaw: 0 }); spawns[1].push({ x, z: -53 - R(-1.5, 2), yaw: Math.PI }); }
  const ffaPts = [[-60, -52], [-20, -52], [20, -52], [60, -52], [-60, 52], [-20, 52], [20, 52], [60, 52], [-48, -30], [-40, 4], [-64, 6], [-55, 26], [-45, 40], [-20, 0], [20, 0], [0, -30], [0, 30], [-11, -27], [11, 27], [40, -28], [62, -26], [58, 4], [40, 6], [44, 30], [62, 40], [-30, -20], [30, 20], [-15.5, 30], [15.5, -36]];
  for (const [x, z] of ffaPts) spawns.ffa.push({ x, z, yaw: Math.atan2(x, z) });
  // validar contra la navegación
  for (const k of [0, 1, 'ffa']) spawns[k] = spawns[k].map((p) => { const i = nav.nearest(p.x, p.z, 5); return i >= 0 ? { x: nav.cx(i), z: nav.cz(i), y: nav.floor[i], yaw: p.yaw } : null; }).filter(Boolean);

  const dom = [{ id: 'A', x: 59, z: 0, r: 6, name: 'ALMACÉN' }, { id: 'B', x: 8.5, z: 0, r: 6, name: 'PLAZA' }, { id: 'C', x: -42, z: 0, r: 6, name: 'PLAZOLETA BRISA' }];
  const sites = [{ id: 'A', x: 54, z: -27, r: 3.2, name: 'CONTENEDORES' }, { id: 'B', x: -48, z: -21, r: 3.2, name: 'MERCADO' }];
  const callouts = [
    { n: 'PLAZA CENTRAL', x0: -26, z0: -18, x1: 26, z1: 18 }, { n: 'MERCADO', x0: -62, z0: -46, x1: -34, z1: -10 },
    { n: 'EDIFICIO BRISA', x0: -72, z0: -4, x1: -50, z1: 14 }, { n: 'AZOTEA BRISA', x0: -72, z0: -4, x1: -50, z1: 16, y: 3 },
    { n: 'PLAZOLETA', x0: -50, z0: -8, x1: -34, z1: 18 }, { n: 'PARQUE', x0: -74, z0: 20, x1: -36, z1: 46 },
    { n: 'CONTENEDORES', x0: 34, z0: -46, x1: 74, z1: -12 }, { n: 'ALMACÉN', x0: 46, z0: -6, x1: 72, z1: 16 },
    { n: 'MUELLE', x0: 34, z0: -10, x1: 46, z1: 20 }, { n: 'GASOLINERA', x0: 34, z0: 20, x1: 74, z1: 46 },
    { n: 'CAFÉ OLIVO', x0: 14, z0: -10, x1: 22, z1: -3 }, { n: 'CALLE NORTE', x0: -80, z0: -64, x1: 80, z1: -46 },
    { n: 'CALLE SUR', x0: -80, z0: 46, x1: 80, z1: 64 }, { n: 'AVENIDA', x0: -7, z0: -46, x1: 7, z1: 46 },
    { n: 'CALLEJÓN', x0: -26, z0: -46, x1: 26, z1: 46 },
  ];
  const vehicleSpawns = [{ x: -40, z: 54.5, yaw: Math.PI / 2, team: 0 }, { x: 40, z: -54.5, yaw: -Math.PI / 2, team: 1 }];
  extras.supplies.push({ x: 0, z: 54, kind: 'ammo' }, { x: 0, z: -54, kind: 'ammo' }, { x: 17, z: -6.5, kind: 'ammo' }, { x: -66, z: 10, kind: 'ammo' }, { x: 66, z: 5, kind: 'ammo' }, { x: 44, z: -30, kind: 'ammo' }, { x: -58, z: 40, kind: 'ammo' }, { x: 58, z: 30, kind: 'ammo' });

  // ============================================================= MINIMAPA
  const minimap = drawMinimap(mm);

  // ------------------------------------------------------------- API de destrucción
  const map = {
    group, world: W, nav, bounds: BOUNDS, spawns, dom, sites, callouts, minimap, vehicleSpawns,
    lamps: extras.lamps, fires: extras.fires, smokeCols: extras.smokeCols, supplies: extras.supplies,
    crates: extras.crates, crateMesh, barrels: extras.barrels, materials: M,
    onExplode: null, onBreak: null,
    // Aplica daño a una caja destructible. Devuelve true si la bala debe continuar (cristal).
    damageBox(box, dmg, point, attacker) {
      if (!box || box.dead || !box.hp) return false;
      const d = box.data;
      if (d && d.type === 'glass') {
        box.dead = true; d.mesh.visible = false;
        glassMesh.setMatrixAt(d.mesh.idx, ZERO); glassMesh.instanceMatrix.needsUpdate = true;
        if (this.onBreak) this.onBreak('glass', d.mesh.position, box);
        return true;
      }
      box.hp -= dmg;
      if (box.hp > 0) return false;
      box.dead = true;
      if (d && d.type === 'crate') {
        const c = extras.crates[d.idx];
        crateMesh.setMatrixAt(d.idx, ZERO); crateMesh.instanceMatrix.needsUpdate = true;
        if (this.onBreak) this.onBreak('crate', new THREE.Vector3(c.x, c.y + c.s / 2, c.z), box);
      } else if (d && d.type === 'barrel') {
        barrelMesh.setMatrixAt(d.ref.idx, ZERO); barrelMesh.instanceMatrix.needsUpdate = true;
        if (this.onExplode) this.onExplode(new THREE.Vector3(d.ref.x, 0.6, d.ref.z), attacker, 'barrel');
      }
      return false;
    },
    calloutAt(x, y, z) {
      for (const c of callouts) {
        if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) { if (c.y !== undefined && y < c.y) continue; if (c.y === undefined && y > 3 && c.n === 'EDIFICIO BRISA') continue; return c.n; }
      }
      return 'PUERTO VARGA';
    },
    dispose() {
      group.traverse((o) => { if (o.geometry && o.geometry !== G.box) o.geometry.dispose(); });
      for (const k in M) M[k].dispose();
      Object.values(G).forEach((g) => g.dispose());
      glassMat.dispose(); crateMat.dispose(); barrelMat.dispose(); barrelGeo.dispose();
      if (M.signs.map) M.signs.map.dispose();
    },
  };
  return map;
}

function drawMinimap(mm) {
  const S = 4; // px por metro
  const w = (BOUNDS.maxX - BOUNDS.minX) * S, h = (BOUNDS.maxZ - BOUNDS.minZ) * S;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tx = (x) => (x - BOUNDS.minX) * S, tz = (z) => (z - BOUNDS.minZ) * S;
  const col = { tiles: '#3b3d40', asphalt: '#26282b', dirt: '#3f3a31', grass: '#2d3a28', concrete: '#383a3c', floorInt: '#4a4c50', room: null, bldg: '#7d8288', tall: '#6b7076', low: '#565a5f', car: '#5f5a55', cont: '#6e6a62', tree: '#2f4a2a' };
  ctx.fillStyle = '#2d2f32'; ctx.fillRect(0, 0, w, h);
  const order = ['tiles', 'asphalt', 'dirt', 'grass', 'concrete', 'floorInt', 'tree', 'low', 'car', 'cont', 'tall', 'bldg'];
  for (const t of order) {
    for (const r of mm) {
      if (r.t !== t) continue;
      ctx.fillStyle = col[t];
      ctx.fillRect(tx(r.x0), tz(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
      if (t === 'bldg' || t === 'cont') { ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(tx(r.x0), tz(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S); }
    }
  }
  for (const r of mm) if (r.t === 'room') { ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 3; ctx.strokeRect(tx(r.x0), tz(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S); }
  return { canvas: c, scale: S, w, h };
}
