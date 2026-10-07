// node tools/qa.mjs outdir hash width height y1,y2,... (y in px, or "0.5vh" multiples like 3.5h)
import { chromium } from 'playwright-core';
const [out, hash = '#/', w = '1440', h = '900', ys = '0'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: +w < 700, isMobile: +w < 700 });
const p = await ctx.newPage();
const logs = [];
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 240)}`); });
p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
p.on('requestfailed', (r) => logs.push('[reqfail] ' + r.url()));
p.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
await p.goto(`http://127.0.0.1:5173/${hash}`, { waitUntil: 'load' });
await p.waitForFunction(() => document.getElementById('boot')?.classList.contains('is-gone'), null, { timeout: 90000 }).catch(() => logs.push('[boot never finished]'));
await p.waitForTimeout(1800);
let n = 0;
for (const y of ys.split(',')) {
  let px = y.endsWith('h') ? parseFloat(y) * +h : parseFloat(y);
  if (y.startsWith('a:')) { const [id, off = '0'] = y.slice(2).split('+'); px = await p.evaluate(([id, off]) => document.getElementById(id).getBoundingClientRect().top + scrollY + off, [id, +off]); }
  if (y.startsWith('p')) { const pp = parseFloat(y.slice(1)); px = await p.evaluate((pp) => { const t = document.querySelector('.tour'); return t.offsetTop + pp * (t.offsetHeight - innerHeight); }, pp); }
  await p.evaluate((py) => window.scrollTo(0, py), px);
  await p.waitForTimeout(+process.env.WAIT || 2600);
  await p.screenshot({ path: `${out}/s${String(n++).padStart(2, '0')}.png` });
}
console.log(logs.length ? logs.join('\n') : 'no console problems');
await b.close();
