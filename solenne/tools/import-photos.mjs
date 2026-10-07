// Replace the placeholder renders with real photography.
//
//   node tools/import-photos.mjs <folder>
//
// Name each file <slug>__<key>.<jpg|jpeg|png|webp|avif>, for example:
//   villa-aurelia__hero.jpg   villa-aurelia__living.jpg   casa-onix__pool.png
// Every file is converted to public/assets/villas/<slug>/<key>.webp (1920 px wide) and
// <key>-960.webp (960 px wide). Keys: hero, hero-day, hero-night, front, aerial,
// living, kitchen, suite, bath, terrace, pool.  Tour stills (tour__s00 … s16) work the same way.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) { console.error('usage: node tools/import-photos.mjs <folder>'); process.exit(1); }
const OUT = path.resolve('public/assets/villas');
const KEYS = new Set(['hero', 'hero-day', 'hero-night', 'front', 'aerial', 'living', 'kitchen', 'suite', 'bath', 'terrace', 'pool']);
let n = 0;
for (const f of fs.readdirSync(dir)) {
  const m = f.match(/^([a-z0-9-]+)__([a-z0-9-]+)\.(jpe?g|png|webp|avif|tiff?)$/i);
  if (!m) { console.warn('skipped (name does not match <slug>__<key>.ext):', f); continue; }
  const [, slug, key] = m;
  if (slug !== 'tour' && !KEYS.has(key)) { console.warn('skipped (unknown key):', f); continue; }
  fs.mkdirSync(path.join(OUT, slug), { recursive: true });
  const img = sharp(path.join(dir, f)).rotate();
  const base = path.join(OUT, slug, key);
  await img.clone().resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(`${base}.webp`);
  await img.clone().resize({ width: 960, withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toFile(`${base}-960.webp`);
  console.log('imported', slug, key); n++;
}
console.log(`${n} image(s) imported.`);
