// node tools/cam.mjs out.png slug tod "x,y,z" "x,y,z" fov
import { chromium } from 'playwright-core';
const [out, slug, tod, pos, look, fov = '60'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://127.0.0.1:5173/render.html?slug=${slug}&shot=hero&tod=${tod}&pos=${pos}&look=${look}&fov=${fov}`);
await p.waitForFunction(() => window.__done === true, null, { timeout: 180000 });
await p.screenshot({ path: out });
await b.close();
