// node tools/batch.mjs outdir slug:shot:tod ...
import { chromium } from 'playwright-core';
const [out, ...jobs] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
for (const j of jobs) {
  const [slug, shot, tod] = j.split(':');
  await p.goto(`http://127.0.0.1:5173/render.html?slug=${slug}&shot=${shot}&tod=${tod ?? 0}`);
  await p.waitForFunction(() => window.__done === true, null, { timeout: 180000 });
  await p.screenshot({ path: `${out}/${slug}_${shot}_${tod ?? 0}.png` });
  console.log('ok', j);
}
await b.close();
