// quick single capture: node tools/shot.mjs slug shot tod out.png [w] [h]
import { chromium } from 'playwright-core';
const [slug, shot, tod, out, w = '1600', h = '900'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[page]', m.text().slice(0, 300)); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://127.0.0.1:5173/render.html?slug=${slug}&shot=${shot}&tod=${tod}`);
await p.waitForFunction(() => window.__done === true, null, { timeout: 180000 });
await p.screenshot({ path: out });
await b.close();
console.log('saved', out);
