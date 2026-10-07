import * as THREE from 'three';
import { artTexture } from './textures.js';

/**
 * Interiors and outdoor furniture. All positions are in villa-local metres and
 * match the room plan documented at the top of villa.js.
 */

const grp = (parent, x, y, z, ry = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
};

export function furnish(kit, root, B, Y, params) {
  const { mats } = kit;
  const f = Y.GY0;               // ground floor surface
  const u = Y.FY1 + 0.02;        // upper floor surface
  const art = (parent, x, y, z, w, h, ry, seed) => {
    const frame = kit.box(parent, w + 0.08, h + 0.08, 0.05, mats.frame, x, y, z, { cast: false });
    frame.rotation.y = ry;
    const tex = artTexture({ a: params.artA, b: params.artB, c: params.artC, seed, w: 256, h: Math.round(256 * h / w) });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    p.position.set(x, y, z); p.rotation.y = ry;
    const off = new THREE.Vector3(0, 0, 0.03).applyEuler(new THREE.Euler(0, ry, 0));
    p.position.add(off);
    parent.add(p);
  };

  const chair = (parent, x, y, z, ry, mat = mats.charcoal) => {
    const c = grp(parent, x, y, z, ry);
    kit.soft(c, 0.5, 0.07, 0.5, 0.03, mat, 0, 0.45, 0);
    kit.soft(c, 0.5, 0.52, 0.07, 0.03, mat, 0, 0.74, -0.22);
    for (const [lx, lz] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) kit.cyl(c, 0.018, 0.018, 0.45, mats.frame, lx, 0.225, lz, 6);
    return c;
  };
  const lounger = (parent, x, z, ry) => {
    const c = grp(parent, x, 0, z, ry);
    kit.box(c, 0.84, 0.05, 2.0, mats.frame, 0, 0.26, 0);
    kit.soft(c, 0.8, 0.14, 1.3, 0.06, mats.white, 0, 0.36, 0.3);
    const back = kit.soft(c, 0.8, 0.14, 0.85, 0.06, mats.white, 0, 0.62, -0.78);
    back.rotation.x = -0.9;
    for (const [lx, lz] of [[-0.38, -0.9], [0.38, -0.9], [-0.38, 0.9], [0.38, 0.9]]) kit.cyl(c, 0.02, 0.02, 0.26, mats.frame, lx, 0.13, lz, 6);
    return c;
  };
  const planter = (parent, x, y, z, r = 0.45, h = 0.6, leaf = true) => {
    kit.cyl(parent, r, r * 0.86, h, mats.concrete, x, y + h / 2, z, 18);
    if (leaf) kit.sphere(parent, r * 1.25, mats.leaf, x, y + h + r * 0.75, z, 1, 1.25, 1, 14);
  };
  const pendant = (parent, x, y0, y1, z, r = 0.22, h = 0.32) => {
    kit.cyl(parent, 0.008, 0.008, y0 - y1, mats.frame, x, (y0 + y1) / 2, z, 4, { cast: false });
    const glow = kit.glowMaterial(0xffd7a0, 2.8);
    const s = kit.cyl(parent, r * 0.9, r, h, glow, x, y1 - h / 2, z, 20, { cast: false });
    kit.cyl(parent, r * 0.92, r * 1.02, 0.03, mats.brass, x, y1 + 0.005, z, 20, { cast: false });
    return s;
  };

  /* ---------------------------------------------------------------- ENTRY */
  const entry = grp(root, 0, 0, 0);
  kit.box(entry, 0.46, 0.85, 2.8, mats.timber, -16.4, f + 0.425, -2);
  kit.sphere(entry, 0.2, mats.white, -16.4, f + 1.08, -2.6, 1, 1.25, 1, 18);
  kit.cyl(entry, 0.05, 0.1, 0.38, mats.white, -16.4, f + 1.05, -1.5, 16);
  art(entry, -16.66, 2.15, -2, 1.6, 2.1, Math.PI / 2, 1);
  kit.soft(entry, 0.5, 0.42, 1.9, 0.08, mats.boucle, -15.75, f + 0.21, -5.2);
  planter(entry, -15.6, f, 5.4, 0.42, 0.55);
  pendant(entry, -13.4, Y.GY1, 2.9, 2.2, 0.28, 0.4);
  kit.pointLight(-13.4, 3.1, 1.4, { base: 26, distance: 12 }, root);
  kit.contact(entry, -15.75, -5.2, 1.0, 2.3, 0.4);
  // sculptural stone seat in the hall
  kit.soft(entry, 1.0, 0.45, 0.9, 0.2, mats.stone, -12.8, f + 0.225, -3.4);
  kit.contact(entry, -12.8, -3.4, 1.7, 1.6, 0.45);

  /* --------------------------------------------------------------- LIVING */
  const liv = grp(root, 0, 0, 0);
  kit.box(liv, 6.6, 0.025, 4.8, mats.charcoal, -4.9, f + 0.0125, -2.6, { cast: false });
  kit.box(liv, 6.2, 0.028, 4.4, mats.linen, -4.9, f + 0.014, -2.6, { cast: false });
  // sectional facing the glass
  kit.soft(liv, 4.3, 0.34, 1.1, 0.06, mats.charcoal, -5.2, f + 0.17 + 0.1, -0.2);
  for (const dx of [-1.05, 1.05]) kit.soft(liv, 2.05, 0.22, 0.88, 0.09, mats.linen, -5.2 + dx, f + 0.52, -0.08);
  kit.soft(liv, 4.3, 0.55, 0.26, 0.1, mats.linen, -5.2, f + 0.76, 0.4);
  kit.soft(liv, 0.3, 0.58, 1.1, 0.1, mats.linen, -7.5, f + 0.5, -0.2);
  kit.soft(liv, 1.15, 0.34, 1.9, 0.06, mats.charcoal, -7.2, f + 0.27, -1.15);
  kit.soft(liv, 1.0, 0.2, 1.7, 0.09, mats.linen, -7.2, f + 0.56, -1.15);
  for (const [cx, cz, r, c] of [[-6.3, -0.2, 0.2, mats.accent], [-3.9, -0.15, -0.25, mats.boucle], [-5.1, -0.3, 0.1, mats.charcoal]]) {
    const cu = kit.soft(liv, 0.5, 0.5, 0.14, 0.06, c, cx, f + 0.82, cz + 0.2); cu.rotation.z = r; cu.rotation.x = -0.2;
  }
  kit.contact(liv, -5.4, -0.4, 5.4, 2.2, 0.4);
  // coffee tables
  kit.cyl(liv, 0.62, 0.62, 0.34, mats.stone, -5.2, f + 0.19, -2.5, 40);
  kit.cyl(liv, 0.4, 0.4, 0.26, mats.timber, -4.1, f + 0.15, -3.2, 32);
  kit.contact(liv, -4.9, -2.8, 2.6, 2.0, 0.45);
  // two armchairs between table and glass, facing the sofa
  for (const x of [-7.0, -3.6]) {
    const a = grp(liv, x, 0, -4.9, Math.PI);
    kit.soft(a, 0.9, 0.4, 0.9, 0.2, mats.boucle, 0, f + 0.22, 0);
    kit.soft(a, 0.9, 0.62, 0.28, 0.14, mats.boucle, 0, f + 0.58, -0.36);
    kit.contact(liv, x, -4.9, 1.5, 1.5, 0.4);
  }
  // fireplace / stone feature wall on the back wall
  kit.span(liv, -9.7, -1.4, f, Y.GY1, 6.52, 6.85, mats.stone);
  const fire = kit.glowMaterial(0xff9a4a, 3.4);
  kit.span(liv, -7.6, -3.6, f + 0.55, f + 0.9, 6.46, 6.54, fire, { cast: false });
  art(liv, -5.6, 2.55, 6.5, 2.3, 1.15, Math.PI, 2);
  // arc floor lamp
  kit.cyl(liv, 0.012, 0.012, 1.8, mats.brass, -2.4, f + 0.9, 0.9, 6);
  kit.sphere(liv, 0.2, kit.glowMaterial(0xffe0b0, 3.2), -2.4, f + 1.9, 0.9);
  // recessed ceiling lines
  const lineGlow = kit.glowMaterial(0xfff0d8, 2.4);
  for (const z of [-5.2, -2.4, 0.4, 3.2]) kit.span(liv, -9.6, 1.6, Y.GY1 - 0.03, Y.GY1 - 0.005, z, z + 0.06, lineGlow, { cast: false });
  kit.pointLight(-5, 3.35, -1.8, { base: 30, distance: 15 }, root);
  planter(liv, 1.3, f, 5.8, 0.55, 0.75);

  /* -------------------------------------------------------------- KITCHEN */
  const kit_ = grp(root, 0, 0, 0);
  // run of cabinets along the back wall
  kit.span(kit_, 3.5, 9.0, f, f + 0.9, 6.15, 6.85, mats.oak);
  kit.span(kit_, 3.5, 9.0, f + 0.9, f + 0.95, 6.1, 6.85, mats.stone);
  kit.span(kit_, 3.5, 9.0, f + 0.95, f + 1.55, 6.78, 6.85, mats.stone, { cast: false });
  kit.span(kit_, 2.2, 3.5, f, Y.GY1 - 0.5, 6.1, 6.85, mats.oak);
  kit.span(kit_, 3.5, 9.0, f + 1.9, f + 2.0, 6.4, 6.85, mats.oak);
  kit.span(kit_, 3.5, 9.0, f + 1.55, f + 1.58, 6.74, 6.8, kit.glowMaterial(0xffe2b8, 2.4), { cast: false });
  for (let i = 0; i < 4; i++) kit.span(kit_, 3.7 + i * 1.3, 4.9 + i * 1.3, f + 0.62, f + 0.64, 6.12, 6.16, mats.brass, { cast: false });
  // island
  kit.box(kit_, 4.8, 0.88, 1.15, mats.oak, 6.0, f + 0.44, 1.0);
  kit.box(kit_, 5.0, 0.06, 1.3, mats.stone, 6.0, f + 0.91, 1.0);
  for (const x of [3.5, 8.5]) kit.box(kit_, 0.06, 0.9, 1.3, mats.stone, x, f + 0.45, 1.0);
  kit.contact(kit_, 6.0, 1.0, 6.2, 2.4, 0.35);
  for (const x of [4.7, 6.0, 7.3]) {
    kit.cyl(kit_, 0.21, 0.19, 0.06, mats.charcoal, x, f + 0.72, -0.3, 24);
    kit.cyl(kit_, 0.02, 0.02, 0.7, mats.frame, x, f + 0.36, -0.3, 6);
    kit.cyl(kit_, 0.17, 0.17, 0.03, mats.frame, x, f + 0.02, -0.3, 16);
  }
  kit.cyl(kit_, 0.13, 0.1, 0.1, mats.white, 6.8, f + 1.0, 1.0, 20);
  kit.sphere(kit_, 0.13, mats.leaf, 6.8, f + 1.12, 1.0, 1, 1.1, 1, 10);
  for (const x of [4.7, 6.0, 7.3]) pendant(kit_, x, Y.GY1, f + 2.25, 1.0, 0.2, 0.3);
  // dining
  kit.box(kit_, 3.2, 0.05, 1.1, mats.oak, 13.0, f + 0.75, -3.0);
  for (const dx of [-1.3, 1.3]) kit.box(kit_, 0.08, 0.72, 0.9, mats.frame, 13.0 + dx, f + 0.38, -3.0);
  for (const dx of [-1.0, 0, 1.0]) {
    chair(kit_, 13.0 + dx, f, -2.1, 0, mats.linen);
    chair(kit_, 13.0 + dx, f, -3.9, Math.PI, mats.linen);
  }
  kit.contact(kit_, 13.0, -3.0, 4.4, 2.5, 0.35);
  kit.cyl(kit_, 0.09, 0.07, 0.3, mats.white, 13.0, f + 0.93, -3.0, 16);
  const dineLight = kit.glowMaterial(0xffd7a0, 2.8);
  kit.box(kit_, 2.4, 0.05, 0.14, dineLight, 13.0, f + 2.3, -3.0, { cast: false });
  for (const dx of [-1.1, 1.1]) kit.cyl(kit_, 0.006, 0.006, Y.GY1 - f - 2.3, mats.frame, 13.0 + dx, (Y.GY1 + f + 2.3) / 2, -3.0, 4, { cast: false });
  kit.pointLight(6, 3.4, 1.2, { base: 28, distance: 14 }, root);
  kit.pointLight(12.5, 3.4, -2.5, { base: 28, distance: 14 }, root);
  for (const z of [-5.6, -2.6, 0.4]) kit.span(kit_, 3, 16, Y.GY1 - 0.03, Y.GY1 - 0.005, z, z + 0.06, lineGlow, { cast: false });

  // floating timber stair hugging the back wall; 24 risers up to the suite
  const stair = grp(root, 0, 0, 0);
  const rise = (Y.FY1 - f) / 24;
  for (let i = 0; i < 24; i++) {
    const x = 16.55 - i * 0.29 - 0.15;
    kit.box(stair, 0.31, 0.07, 1.35, mats.oak, x, f + (i + 1) * rise - 0.035, 6.15);
  }
  const slope = Math.atan2(Y.FY1 - f, 24 * 0.29);
  const rail = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 0.95), mats.glass);
  rail.rotation.z = -slope; rail.renderOrder = 5;
  rail.position.set(12.9, f + 2.6 + 0.45, 5.42);
  stair.add(rail);
  const hr = kit.box(stair, 7.4, 0.04, 0.05, mats.frame, 12.9, f + 2.6 + 0.93, 5.42, { cast: false });
  hr.rotation.z = -slope;
  kit.pointLight(13, 3.2, 4.4, { base: 22, distance: 9 }, root);

  /* -------------------------------------------------------- GROUND TERRACE */
  const ter = grp(root, 0, 0, 0);
  kit.soft(ter, 3.4, 0.36, 1.05, 0.08, mats.linen, -1.8, 0.22, -9.2);
  kit.soft(ter, 3.4, 0.5, 0.26, 0.1, mats.linen, -1.8, 0.55, -9.7);
  kit.soft(ter, 1.05, 0.36, 2.0, 0.08, mats.linen, -3.9, 0.22, -10.2);
  kit.cyl(ter, 0.55, 0.55, 0.3, mats.stone, -1.6, 0.19, -11.2, 32);
  kit.box(ter, 5.0, 0.02, 3.2, mats.boucle, -1.9, 0.01, -10.2, { cast: false });
  kit.contact(ter, -2.2, -10.2, 5.6, 3.8, 0.35, 0.03);
  kit.box(ter, 2.6, 0.05, 1.0, mats.timber, 9.5, 0.75, -10.2);
  for (const dx of [-1.1, 1.1]) kit.box(ter, 0.07, 0.72, 0.85, mats.frame, 9.5 + dx, 0.38, -10.2);
  for (const dx of [-0.8, 0.8]) { chair(ter, 9.5 + dx, 0, -9.1, 0, mats.charcoal); chair(ter, 9.5 + dx, 0, -11.3, Math.PI, mats.charcoal); }
  for (const x of [-7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10, 12.5, 15]) {
    kit.cyl(ter, 0.06, 0.06, 0.02, kit.glowMaterial(0xffe2b8, 3.0), x, Y.GY1 - 0.015, -10.5, 12, { cast: false });
  }
  planter(ter, 15.6, 0, -8.2, 0.55, 0.7);
  planter(ter, -12.4, 0, -8.6, 0.5, 0.65);
  kit.pointLight(1, 3.3, -10.2, { base: 40, distance: 14 }, root);
  kit.pointLight(10, 3.3, -10.2, { base: 34, distance: 12 }, root);

  /* ---------------------------------------------------------------- SUITE */
  const suite = grp(root, 0, 0, 0);
  kit.span(suite, -2.9, 16.7, Y.FY1, u, -9, 6.85, mats.oak, { cast: false });
  kit.box(suite, 3.6, 0.025, 3.6, mats.boucle, 3.6, u + 0.014, 4.1, { cast: false });
  kit.box(suite, 3.1, 1.15, 0.12, mats.timber, 3.6, u + 0.65, 6.78);
  kit.soft(suite, 2.7, 0.3, 2.45, 0.05, mats.charcoal, 3.6, u + 0.2, 4.95);
  kit.soft(suite, 2.5, 0.3, 2.3, 0.1, mats.white, 3.6, u + 0.5, 4.95);
  kit.soft(suite, 2.52, 0.12, 1.55, 0.06, mats.linen, 3.6, u + 0.7, 4.35);
  kit.soft(suite, 2.45, 0.05, 0.55, 0.02, mats.accent, 3.6, u + 0.78, 3.7);
  for (const dx of [-0.6, 0.6, -0.62, 0.62]) {
    const p = kit.soft(suite, 0.62, 0.2, 0.4, 0.09, mats.white, 3.6 + dx, u + 0.78 + (Math.abs(dx) > 0.61 ? 0.07 : 0), 6.15 - (Math.abs(dx) > 0.61 ? 0.1 : 0));
    p.rotation.x = -0.35;
  }
  for (const x of [1.45, 5.75]) {
    kit.box(suite, 0.5, 0.42, 0.45, mats.timber, x, u + 0.21, 6.6);
    kit.cyl(suite, 0.012, 0.012, 0.3, mats.brass, x, u + 0.57, 6.6, 6);
    kit.cyl(suite, 0.09, 0.14, 0.2, kit.glowMaterial(0xffd9a3, 3.0), x, u + 0.82, 6.6, 18, { cast: false });
  }
  art(suite, 3.6, u + 2.15, 6.8, 1.8, 0.95, Math.PI, 3);
  kit.contact(suite, 3.6, 4.9, 3.6, 3.3, 0.5, u + 0.012);
  // seating nook facing the glass
  for (const x of [11.2, 13.4]) {
    const a = grp(suite, x, u - 0.0, -4.4, Math.PI);
    kit.soft(a, 0.95, 0.4, 0.95, 0.2, mats.boucle, 0, 0.22, 0);
    kit.soft(a, 0.95, 0.6, 0.28, 0.14, mats.boucle, 0, 0.56, -0.38);
  }
  kit.cyl(suite, 0.38, 0.38, 0.42, mats.stone, 12.3, u + 0.21, -5.6, 28);
  // foot-of-bed bench, reading corner and a second plant to settle the room
  kit.soft(suite, 1.7, 0.4, 0.46, 0.07, mats.boucle, 3.6, u + 0.2, 2.7);
  kit.soft(suite, 1.4, 0.05, 0.4, 0.02, mats.accent, 3.6, u + 0.43, 2.7);
  kit.cyl(suite, 0.012, 0.012, 1.7, mats.brass, 7.0, u + 0.85, 6.3, 6);
  kit.sphere(suite, 0.2, kit.glowMaterial(0xffe0b0, 3.2), 7.0, u + 1.75, 6.3);
  planter(suite, 15.9, u, 5.9, 0.5, 0.7);
  planter(suite, -1.9, u, 6.0, 0.4, 0.6);
  kit.soft(suite, 1.1, 0.42, 1.1, 0.2, mats.charcoal, 8.2, u + 0.21, -0.6);
  kit.contact(suite, 8.2, -0.6, 1.8, 1.8, 0.4, u + 0.012);
  // sheer curtains and a long timber wardrobe wall
  kit.box(suite, 0.5, 3.4, 0.08, mats.linen, 16.35, u + 1.7, -8.7, { cast: false });
  kit.box(suite, 0.5, 3.4, 0.08, mats.linen, -2.35, u + 1.7, -8.7, { cast: false });
  kit.span(suite, 7.2, 9.2, u, Y.UY1 - 0.2, 6.35, 6.85, mats.timber);
  for (const z of [-6.8, -3.8, -0.8, 2.2]) kit.span(suite, -2.9, 16.7, Y.UY1 - 0.03, Y.UY1 - 0.005, z, z + 0.06, lineGlow, { cast: false });
  kit.pointLight(4, 7.35, 2.5, { base: 36, distance: 13 }, root);
  kit.pointLight(12, 7.35, -3, { base: 28, distance: 12 }, root);

  /* ----------------------------------------------------------------- BATH */
  const bath = grp(root, 0, 0, 0);
  kit.span(bath, -11.7, -3.1, Y.FY1, u + 0.004, -9, 6.85, mats.floorIn, { cast: false });
  kit.span(bath, -11.7, -11.62, u, Y.UY1, -8.9, 6.85, mats.timberV);
  kit.span(bath, -11.7, -3.1, u, Y.UY1, 6.5, 6.85, mats.stone);
  const wash = kit.glowMaterial(0xffd9a6, 2.6);
  kit.span(bath, -11.62, -11.56, u + 0.05, u + 0.09, -8.8, 6.4, wash, { cast: false });
  // freestanding tub beside the glass
  kit.soft(bath, 2.0, 0.62, 0.92, 0.32, mats.white, -7.2, u + 0.31, -6.6);
  const tubInner = kit.soft(bath, 1.7, 0.04, 0.66, 0.2, new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.4 }), -7.2, u + 0.62, -6.6, { cast: false });
  tubInner.renderOrder = 2;
  kit.cyl(bath, 0.025, 0.025, 0.9, mats.brass, -6.1, u + 0.62 + 0.45, -6.95, 8);
  kit.contact(bath, -7.2, -6.6, 3.0, 2.0, 0.4, u + 0.012);
  // stone plinth with a ceramic vessel, and a timber bench
  kit.soft(bath, 0.9, 0.4, 0.9, 0.12, mats.stone, -9.6, u + 0.2, -5.6);
  kit.sphere(bath, 0.17, mats.white, -9.6, u + 0.55, -5.6, 1, 1.3, 1, 16);
  kit.soft(bath, 1.7, 0.4, 0.5, 0.06, mats.timber, -4.6, u + 0.2, -6.2);
  kit.box(bath, 0.4, 0.14, 0.3, mats.boucle, -4.9, u + 0.47, -6.2);
  // double vanity along the timber wall with a backlit mirror
  kit.box(bath, 0.58, 0.5, 3.0, mats.oak, -11.3, u + 0.78, -0.6);
  kit.box(bath, 0.64, 0.05, 3.1, mats.stone, -11.3, u + 1.05, -0.6);
  for (const dz of [-0.8, 0.8]) kit.cyl(bath, 0.2, 0.17, 0.12, mats.white, -11.3, u + 1.14, -0.6 + dz, 24);
  const mirror = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, metalness: 1, roughness: 0.05 });
  kit.box(bath, 0.03, 1.4, 2.4, mirror, -11.58, u + 1.95, -0.6, { cast: false });
  kit.box(bath, 0.02, 1.5, 2.5, kit.glowMaterial(0xffe2bc, 2.6), -11.6, u + 1.95, -0.6, { cast: false });
  // glass shower
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), mats.glass);
  sh.rotation.y = Math.PI / 2; sh.position.set(-9.0, u + 1.3, 4.7); sh.renderOrder = 5; bath.add(sh);
  kit.cyl(bath, 0.2, 0.2, 0.02, mats.brass, -10.4, u + 2.5, 4.7, 24);
  planter(bath, -4.1, u, -7.8, 0.35, 0.5);
  planter(bath, -10.6, u, -8.0, 0.4, 0.55);
  kit.pointLight(-7.5, 7.35, -1.5, { base: 32, distance: 13 }, root);
  for (const z of [-6.5, -2.8, 0.9, 4.5]) kit.span(bath, -11.5, -3.2, Y.UY1 - 0.03, Y.UY1 - 0.005, z, z + 0.06, lineGlow, { cast: false });

  /* -------------------------------------------------------------- BALCONY */
  const bal = grp(root, 0, 0, 0);
  for (const x of [5.5, 8.4]) {
    const l = lounger(bal, x, -11.4, Math.PI);
    l.position.y = Y.FY1 + 0.02;
  }
  kit.cyl(bal, 0.3, 0.3, 0.42, mats.stone, 7.0, Y.FY1 + 0.23, -11.4, 24);
  planter(bal, 14.6, Y.FY1 + 0.02, -12.5, 0.5, 0.65);
  planter(bal, -2.8, Y.FY1 + 0.02, -12.5, 0.45, 0.6);
  kit.pointLight(7, 7.0, -11.6, { base: 20, distance: 10 }, root);

  /* ----------------------------------------------------------- POOL DECK */
  const deck = grp(root, 0, 0, 0);
  const spots = [[-13, -21, 0.0], [-13, -24.5, 0.0], [-18.5, -21, 0.0], [-18.5, -24.5, 0.0], [18.5, -21, 0], [18.5, -24.5, 0], [-4, -16.2, Math.PI], [4, -16.2, Math.PI], [11, -16.2, Math.PI]];
  spots.forEach(([x, z, ry]) => lounger(deck, x, z, ry));
  for (const [x, z] of [[-15.7, -22.7], [18.5, -22.7], [0.0, -16.2]]) {
    if (z === -16.2 && x === 0) continue;
    kit.cyl(deck, 0.03, 0.03, 2.6, mats.frame, x, 1.3, z, 6);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.45, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xefe8da, roughness: 0.95, side: THREE.DoubleSide }));
    canopy.position.set(x, 2.55, z); canopy.castShadow = kit.shadows; deck.add(canopy);
  }
  // path bollards, warm glow at night
  const bollard = kit.glowMaterial(0xffd8a0, 3.4);
  for (let i = 0; i < 7; i++) {
    for (const x of [-20.8, 20.8]) {
      kit.cyl(deck, 0.07, 0.07, 0.55, mats.frame, x, 0.27, -9 - i * 2.9, 10);
      kit.cyl(deck, 0.06, 0.06, 0.06, bollard, x, 0.58, -9 - i * 2.9, 10, { cast: false });
    }
  }
  kit.pointLight(2, 1.2, -19.5, { color: 0x6fe0e8, base: 12, distance: 14 }, root);
}
