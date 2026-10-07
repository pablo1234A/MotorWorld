// Modelos de armas procedurales originales. El cañón apunta a -Z; origen en la empuñadura.
import * as THREE from 'three';
import { camoTexture } from './textures.js';
import { CAMOS } from './data.js';

const geoCache = new Map();
function geo(kind, a, b, c) {
  const k = kind + a + '_' + b + '_' + c;
  let g = geoCache.get(k);
  if (!g) {
    if (kind === 'box') g = new THREE.BoxGeometry(a, b, c);
    else if (kind === 'cyl') g = new THREE.CylinderGeometry(a, a, b, c || 12);
    else if (kind === 'cone') g = new THREE.CylinderGeometry(a, b, c, 12);
    else if (kind === 'tube') { g = new THREE.CylinderGeometry(a, a, b, c || 16, 1, true); }
    else if (kind === 'ring') { g = new THREE.CylinderGeometry(a, b, c, 16, 1, true); }
    geoCache.set(k, g);
  }
  return g;
}

const matCache = new Map();
function mats(camoId, detail) {
  const k = camoId + detail;
  if (matCache.has(k)) return matCache.get(k);
  const camo = CAMOS[camoId] || CAMOS.pavonado;
  const tex = detail ? camoTexture(camo, 256) : null;
  const base = new THREE.Color(camo.colors[0]);
  const m = {
    body: new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : base, map: tex, metalness: camo.pattern === 'metal' ? 0.9 : 0.55, roughness: camo.pattern === 'metal' ? 0.25 : 0.42 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, metalness: 0.1, roughness: 0.75 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x2c2e31, metalness: 0.95, roughness: 0.3 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a3b22, metalness: 0.0, roughness: 0.6 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0a1418, metalness: 0.9, roughness: 0.05, emissive: 0x051018 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x6f9fb8, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }),
    tubeIn: new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.3, roughness: 0.8, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 1.0, roughness: 0.18 }),
  };
  matCache.set(k, m);
  return m;
}

function reticleTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.translate(64, 64);
  if (kind === 'dot') {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 10); g.addColorStop(0, 'rgba(255,60,40,1)'); g.addColorStop(0.5, 'rgba(255,40,30,0.8)'); g.addColorStop(1, 'rgba(255,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 10, 0, 7); x.fill();
  } else if (kind === 'holo') {
    x.strokeStyle = 'rgba(255,70,50,0.95)'; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 34, 0, 7); x.stroke();
    x.fillStyle = 'rgba(255,70,50,1)'; x.beginPath(); x.arc(0, 0, 4, 0, 7); x.fill();
    for (const a of [0, 1, 2, 3]) { x.save(); x.rotate(a * Math.PI / 2); x.fillRect(-1.5, 38, 3, 10); x.restore(); }
  } else if (kind === 'x3') {
    x.strokeStyle = 'rgba(10,10,10,0.95)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(-64, 0); x.lineTo(-8, 0); x.moveTo(8, 0); x.lineTo(64, 0); x.moveTo(0, 8); x.lineTo(0, 64); x.stroke();
    x.fillStyle = 'rgba(255,60,30,1)'; x.beginPath(); x.moveTo(0, -1); x.lineTo(-5, 8); x.lineTo(5, 8); x.closePath(); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const retCache = {};

// def: arma de WEAPONS; opts: {optic, camo, detail(bool)}
export function buildGun(def, opts = {}) {
  const detail = opts.detail !== false;
  const M = mats(opts.camo || 'pavonado', detail);
  const g = new THREE.Group();
  const add = (geom, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => {
    const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = !detail; parent.add(m); return m;
  };
  const t = def.model.type;
  const info = { group: g, muzzle: new THREE.Object3D(), sightY: 0.07, sightZ: 0, grip: new THREE.Vector3(0, -0.04, 0.02), fore: new THREE.Vector3(0, -0.02, -0.3), mag: null, magHome: null, optic: 'iron', bolt: null };
  let railY = 0.055, railZ0 = -0.2, railZ1 = 0.08, muzzleZ = -0.6;
  const cylX = Math.PI / 2;

  if (t === 'ar' || t === 'dmr') {
    const bl = def.model.barrel;
    add(geo('box', 0.058, 0.085, 0.34), M.body, 0, 0.012, -0.07);
    add(geo('box', 0.05, 0.03, 0.32), M.poly, 0, 0.04, -0.06);
    add(geo('box', 0.056, 0.066, 0.27), M.poly, 0, 0.012, -0.36);
    if (detail) for (let i = 0; i < 4; i++) add(geo('box', 0.06, 0.008, 0.03), M.steel, 0, -0.024, -0.26 - i * 0.06);
    add(geo('cyl', 0.011, bl, 10), M.steel, 0, 0.016, -0.49 - bl / 2 + 0.06, cylX);
    add(geo('cyl', 0.017, 0.07, 10), M.steel, 0, 0.016, -0.5 - bl + 0.06, cylX);
    muzzleZ = -0.54 - bl + 0.06;
    add(geo('box', 0.04, 0.075, 0.2), M.poly, 0, -0.005, 0.2, 0.08);
    add(geo('box', 0.042, 0.1, 0.05), M.poly, 0, 0.0, 0.31);
    add(geo('box', 0.03, 0.1, 0.045), M.poly, 0, -0.07, 0.03, 0.3);
    const mag = add(geo('box', 0.032, t === 'dmr' ? 0.12 : 0.17, 0.07), M.body, 0, -0.1, -0.12, -0.18);
    info.mag = mag; info.magHome = mag.position.clone();
    add(geo('box', 0.024, 0.012, 0.36), M.steel, 0, 0.061, -0.07);
    info.fore.set(0, -0.025, -0.35); info.grip.set(0, -0.06, 0.03);
    railY = 0.067; railZ0 = -0.2; railZ1 = 0.06;
    if (t === 'dmr') add(geo('box', 0.03, 0.03, 0.12), M.poly, 0, 0.045, 0.22);
    if (detail) { add(geo('box', 0.012, 0.02, 0.04), M.steel, 0.034, 0.02, -0.02); }
  } else if (t === 'smg') {
    add(geo('box', 0.055, 0.08, 0.28), M.body, 0, 0.01, -0.06);
    add(geo('box', 0.05, 0.055, 0.12), M.poly, 0, 0.0, -0.25);
    add(geo('cyl', 0.012, 0.12, 10), M.steel, 0, 0.014, -0.36, cylX);
    add(geo('cyl', 0.022, 0.1, 10), M.steel, 0, 0.014, -0.44, cylX);
    muzzleZ = -0.49;
    add(geo('box', 0.012, 0.06, 0.2), M.steel, 0.014, 0.0, 0.18); add(geo('box', 0.012, 0.06, 0.2), M.steel, -0.014, 0.0, 0.18);
    add(geo('box', 0.04, 0.07, 0.03), M.poly, 0, -0.005, 0.29);
    add(geo('box', 0.03, 0.095, 0.04), M.poly, 0, -0.065, 0.02, 0.25);
    const mag = add(geo('box', 0.028, 0.2, 0.05), M.body, 0, -0.12, -0.13, -0.05); info.mag = mag; info.magHome = mag.position.clone();
    add(geo('box', 0.022, 0.012, 0.24), M.steel, 0, 0.056, -0.06);
    info.fore.set(0, -0.08, -0.13); info.grip.set(0, -0.06, 0.02);
    railY = 0.062; railZ0 = -0.15; railZ1 = 0.04;
  } else if (t === 'shotgun') {
    add(geo('box', 0.058, 0.085, 0.3), M.body, 0, 0.012, -0.05);
    add(geo('cyl', 0.016, 0.62, 12), M.steel, 0, 0.03, -0.5, cylX);
    add(geo('cyl', 0.014, 0.5, 12), M.steel, 0, -0.004, -0.45, cylX);
    const pump = add(geo('box', 0.05, 0.05, 0.16), M.wood, 0, -0.006, -0.38); info.bolt = pump; info.boltHome = pump.position.clone();
    muzzleZ = -0.82;
    add(geo('box', 0.045, 0.08, 0.28), M.wood, 0, -0.03, 0.22, 0.18);
    add(geo('box', 0.03, 0.09, 0.045), M.wood, 0, -0.065, 0.04, 0.35);
    add(geo('box', 0.006, 0.012, 0.006), M.chrome, 0, 0.052, -0.78);
    info.fore.set(0, -0.03, -0.38); info.grip.set(0, -0.06, 0.04);
    railY = 0.056; railZ0 = -0.15; railZ1 = 0.06;
  } else if (t === 'sniper') {
    add(geo('box', 0.06, 0.08, 0.36), M.body, 0, 0.012, -0.06);
    add(geo('box', 0.062, 0.07, 0.34), M.poly, 0, -0.01, -0.36);
    add(geo('cyl', 0.013, 0.62, 10), M.steel, 0, 0.018, -0.74, cylX);
    add(geo('cyl', 0.022, 0.1, 10), M.steel, 0, 0.018, -1.06, cylX);
    muzzleZ = -1.11;
    add(geo('box', 0.05, 0.1, 0.32), M.poly, 0, -0.02, 0.26, 0.05);
    add(geo('box', 0.04, 0.035, 0.14), M.poly, 0, 0.05, 0.25);
    add(geo('box', 0.032, 0.1, 0.045), M.poly, 0, -0.07, 0.05, 0.3);
    const bolt = add(geo('cyl', 0.008, 0.06, 6), M.chrome, 0.04, 0.03, 0.05, 0, 0, Math.PI / 2); info.bolt = bolt; info.boltHome = bolt.position.clone();
    const mag = add(geo('box', 0.03, 0.06, 0.08), M.poly, 0, -0.055, -0.08); info.mag = mag; info.magHome = mag.position.clone();
    add(geo('box', 0.006, 0.12, 0.012), M.steel, 0.025, -0.08, -0.45, 0.6); add(geo('box', 0.006, 0.12, 0.012), M.steel, -0.025, -0.08, -0.45, 0.6);
    info.fore.set(0, -0.045, -0.33); info.grip.set(0, -0.06, 0.05);
    railY = 0.058;
  } else if (t === 'lmg') {
    add(geo('box', 0.075, 0.1, 0.4), M.body, 0, 0.012, -0.06);
    add(geo('box', 0.07, 0.07, 0.22), M.poly, 0, 0.005, -0.36);
    add(geo('cyl', 0.014, 0.5, 10), M.steel, 0, 0.02, -0.65, cylX);
    add(geo('cyl', 0.024, 0.32, 10), M.poly, 0, 0.02, -0.6, cylX);
    add(geo('cyl', 0.02, 0.07, 10), M.steel, 0, 0.02, -0.92, cylX);
    muzzleZ = -0.96;
    const mag = add(geo('box', 0.1, 0.13, 0.13), M.poly, -0.03, -0.1, -0.12); info.mag = mag; info.magHome = mag.position.clone();
    add(geo('box', 0.045, 0.08, 0.24), M.poly, 0, -0.01, 0.23, 0.06);
    add(geo('box', 0.03, 0.1, 0.045), M.poly, 0, -0.07, 0.06, 0.3);
    add(geo('box', 0.02, 0.05, 0.16), M.steel, 0, 0.09, -0.08);
    add(geo('box', 0.008, 0.18, 0.012), M.steel, 0.03, -0.1, -0.6, 0.5); add(geo('box', 0.008, 0.18, 0.012), M.steel, -0.03, -0.1, -0.6, 0.5);
    info.fore.set(0, -0.03, -0.36); info.grip.set(0, -0.06, 0.06);
    railY = 0.072; railZ0 = -0.22; railZ1 = -0.02;
  } else if (t === 'pistol' || t === 'mp') {
    const slide = add(geo('box', 0.03, 0.034, 0.19), M.body, 0, 0.03, -0.05); info.bolt = slide; info.boltHome = slide.position.clone();
    add(geo('box', 0.028, 0.026, 0.17), M.poly, 0, 0.002, -0.045);
    add(geo('box', 0.028, 0.105, 0.048), M.poly, 0, -0.055, 0.02, 0.22);
    add(geo('box', 0.006, 0.012, 0.006), M.steel, 0, 0.051, -0.13);
    add(geo('box', 0.02, 0.01, 0.008), M.steel, 0, 0.051, 0.03);
    const mag = add(geo('box', 0.022, t === 'mp' ? 0.2 : 0.1, 0.036), M.steel, 0, t === 'mp' ? -0.1 : -0.06, 0.02, 0.22); info.mag = mag; info.magHome = mag.position.clone();
    muzzleZ = -0.15;
    if (t === 'mp') { add(geo('box', 0.024, 0.024, 0.06), M.steel, 0, 0.02, -0.17); muzzleZ = -0.2; add(geo('box', 0.01, 0.05, 0.14), M.steel, 0, -0.01, 0.13); }
    info.fore.set(0, -0.07, 0.0); info.grip.set(0, -0.055, 0.025);
    info.sightY = 0.058; railY = 0.05; info.oneHand = false; info.pistol = true;
  } else if (t === 'revolver') {
    add(geo('cyl', 0.012, 0.16, 10), M.body, 0, 0.032, -0.13, cylX);
    add(geo('box', 0.016, 0.024, 0.16), M.body, 0, 0.044, -0.13);
    const cyl = add(geo('cyl', 0.024, 0.045, 8), M.body, 0, 0.022, -0.035, cylX); info.mag = cyl; info.magHome = cyl.position.clone();
    add(geo('box', 0.026, 0.03, 0.09), M.body, 0, 0.022, 0.0);
    add(geo('box', 0.028, 0.1, 0.045), M.wood, 0, -0.045, 0.04, 0.3);
    add(geo('box', 0.005, 0.012, 0.006), M.steel, 0, 0.062, -0.2);
    muzzleZ = -0.215;
    info.fore.set(0, -0.07, 0.0); info.grip.set(0, -0.05, 0.035);
    info.sightY = 0.066; railY = 0.05; info.pistol = true;
  }
  info.muzzle.position.set(0, (t === 'pistol' || t === 'mp') ? 0.03 : t === 'revolver' ? 0.032 : 0.018, muzzleZ - 0.01);
  g.add(info.muzzle);

  // ------------------------------ ópticas
  const isPistol = t === 'pistol' || t === 'mp' || t === 'revolver';
  let optic = def.scope ? 'scope' : (opts.optic || 'iron');
  if (isPistol) optic = 'iron';
  info.optic = optic;
  if (optic === 'iron' && !isPistol) {
    add(geo('box', 0.006, 0.03, 0.006), M.steel, 0, railY + 0.015, railZ0);
    add(geo('box', 0.02, 0.025, 0.012), M.steel, 0, railY + 0.012, railZ1);
    info.sightY = railY + 0.027; info.sightZ = railZ1;
  } else if (optic === 'dot' || optic === 'holo') {
    const z = (railZ0 + railZ1) / 2 + 0.03;
    if (optic === 'dot') {
      add(geo('box', 0.03, 0.012, 0.06), M.poly, 0, railY + 0.006, z);
      add(geo('tube', 0.019, 0.055, 16), M.tubeIn, 0, railY + 0.034, z, cylX);
      add(geo('cyl', 0.017, 0.002, 14), M.glass, 0, railY + 0.034, z - 0.026, cylX);
      info.sightY = railY + 0.034;
    } else {
      add(geo('box', 0.04, 0.014, 0.08), M.poly, 0, railY + 0.007, z);
      add(geo('box', 0.044, 0.006, 0.07), M.poly, 0, railY + 0.066, z);
      add(geo('box', 0.006, 0.06, 0.07), M.poly, 0.02, railY + 0.036, z); add(geo('box', 0.006, 0.06, 0.07), M.poly, -0.02, railY + 0.036, z);
      info.sightY = railY + 0.036;
    }
    if (detail) {
      retCache[optic] ||= reticleTexture(optic);
      const rm = new THREE.Mesh(new THREE.PlaneGeometry(optic === 'dot' ? 0.012 : 0.03, optic === 'dot' ? 0.012 : 0.03), new THREE.MeshBasicMaterial({ map: retCache[optic], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      rm.position.set(0, info.sightY, z - 0.03); rm.renderOrder = 10; g.add(rm); info.reticle = rm;
    }
    info.sightZ = z;
  } else if (optic === 'x3' || optic === 'scope') {
    const len = optic === 'scope' ? 0.3 : 0.17, r = optic === 'scope' ? 0.022 : 0.019;
    const z = optic === 'scope' ? -0.08 : (railZ0 + railZ1) / 2;
    add(geo('box', 0.02, 0.025, 0.04), M.poly, 0, railY + 0.012, z - len * 0.3); add(geo('box', 0.02, 0.025, 0.04), M.poly, 0, railY + 0.012, z + len * 0.3);
    add(geo('tube', r, len, 16), M.tubeIn, 0, railY + 0.045, z, cylX);
    add(geo('ring', r * 1.45, r, 0.05), M.tubeIn, 0, railY + 0.045, z - len / 2 - 0.02, cylX);
    add(geo('cyl', r * 1.3, 0.003, 14), M.glass, 0, railY + 0.045, z - len / 2 - 0.046, cylX);
    add(geo('cyl', r * 1.0, 0.002, 14), M.glass, 0, railY + 0.045, z + len / 2 + 0.001, cylX);
    if (optic === 'scope') add(geo('cyl', 0.009, 0.03, 8), M.poly, 0, railY + 0.075, z, 0);
    info.sightY = railY + 0.045; info.sightZ = z;
    if (detail && optic === 'x3') {
      retCache.x3 ||= reticleTexture('x3');
      const rm = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({ map: retCache.x3, transparent: true, depthWrite: false, toneMapped: false }));
      rm.position.set(0, info.sightY, z + len / 2 + 0.004); rm.renderOrder = 10; g.add(rm); info.reticle = rm;
    }
  }
  if (!isPistol && !def.scope && optic !== 'iron' && detail) {
    // mira trasera abatida
    add(geo('box', 0.016, 0.006, 0.01), M.steel, 0, railY + 0.004, railZ1);
  }
  return info;
}
