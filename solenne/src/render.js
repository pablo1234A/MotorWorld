// Offline render stage — driven by tools/render.mjs through query params:
//   ?slug=villa-aurelia&shot=living&tod=0
import { World } from './world/world.js';
import { bySlug, VILLAS } from './data/villas.js';
import { TOUR } from './world/shots.js';

const q = new URLSearchParams(location.search);
const villa = bySlug(q.get('slug')) || VILLAS[0];
const canvas = document.getElementById('c');
const world = new World(canvas, villa.render, {
  preserve: true, forceShadows: true, tod: parseFloat(q.get('tod') ?? '0'),
  pixelRatio: 1, quality: 'high',
});
const name = q.get('shot') || 'hero';
let shot;
if (name.startsWith('tour-')) { const k = TOUR[+name.slice(5)]; world.setCamera(k.pos, k.look, k.fov); shot = k; }
else shot = world.shot(name);
if (q.has('pos')) {
  const p = q.get('pos').split(',').map(Number), l = q.get('look').split(',').map(Number);
  world.setCamera(p, l, parseFloat(q.get('fov') || shot.fov));
}
world.resize(window.innerWidth, window.innerHeight);
let n = 0;
function frame() {
  world.render(0.016);
  if (++n < 6) requestAnimationFrame(frame); else window.__done = true;
}
requestAnimationFrame(frame);
window.__world = world;
