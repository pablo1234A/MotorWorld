// Renders the placeholder photography for every villa. Idempotent: skips existing files.
// usage: node tools/render-all.mjs [slug ...]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/assets/villas');
import { VILLAS } from '../src/data/villas.js';
const HERO = Object.fromEntries(VILLAS.map((v) => [v.slug, v.heroShot]));
const SLUGS = ['villa-aurelia', 'casa-onix', 'son-alba', 'quinta-do-mar', 'le-belvedere', 'palm-crescent', 'finca-sereno', 'casa-duna'];
const want = process.argv.slice(2);
const slugs = want.length ? want : SLUGS;

// key → [shot, tod]
const JOBS = {
  hero:    ['@hero', 1.0], 'hero-day': ['@hero', 0.0], 'hero-night': ['@hero', 2.0],
  front:   ['front', 0.8], aerial: ['aerial', 0.75],
  living:  ['living', 0.45], kitchen: ['kitchen', 0.45], suite: ['suite', 0.55],
  bath:    ['bath', 0.6], terrace: ['terrace', 0.7], pool: ['pool', 1.0],
};
const TOUR_STILLS = [0, 2, 4, 6, 7, 10, 12, 13, 15, 16];
const TOUR_TOD = { 0: 1.0, 2: 1.0, 4: 0.6, 6: 0.5, 7: 0.5, 10: 0.6, 12: 0.7, 13: 0.85, 15: 1.1, 16: 2.0 };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));

async function capture(url, file) {
  await p.goto(url);
  await p.waitForFunction(() => window.__done === true, null, { timeout: 240000 });
  const buf = await p.screenshot({ type: 'png' });
  await sharp(buf).webp({ quality: 82, effort: 5 }).toFile(`${file}.webp`);
  await sharp(buf).resize(960).webp({ quality: 78, effort: 5 }).toFile(`${file}-960.webp`);
}

for (const slug of slugs) {
  fs.mkdirSync(path.join(OUT, slug), { recursive: true });
  for (const [key, [shot, tod]] of Object.entries(JOBS)) {
    const file = path.join(OUT, slug, key);
    if (fs.existsSync(`${file}.webp`)) continue;
    await capture(`http://127.0.0.1:5173/render.html?slug=${slug}&shot=${shot === '@hero' ? HERO[slug] : shot}&tod=${tod}`, file);
    console.log('rendered', slug, key);
  }
}
// walkthrough stills for the fallback tour (hero villa only)
fs.mkdirSync(path.join(OUT, 'tour'), { recursive: true });
if (slugs.includes('villa-aurelia')) {
  for (const i of TOUR_STILLS) {
    const file = path.join(OUT, 'tour', `s${String(i).padStart(2, '0')}`);
    if (fs.existsSync(`${file}.webp`)) continue;
    await capture(`http://127.0.0.1:5173/render.html?slug=villa-aurelia&shot=tour-${i}&tod=${TOUR_TOD[i]}`, file);
    console.log('rendered tour', i);
  }
}
await b.close();
console.log('ALL DONE');
