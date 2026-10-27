// Scripted play session for QA: node tools/play.mjs <outdir> [steps json]
import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const url = process.argv[3] || 'http://localhost:5173/';
const w = +(process.env.W || 960), h = +(process.env.H || 540);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); console.log('shot', name); };
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000, polling: 500 });
console.log('ready', Date.now() - t0, 'ms');
await shot('01-loading');
await page.mouse.click(w / 2, h / 2);
await page.waitForTimeout(2500);
await shot('02-menu');
const steps = JSON.parse(process.env.STEPS || '[]');
for (const s of steps) {
  if (s.click) { await page.click(s.click, { timeout: 20000 }).catch(e => console.log('click fail', s.click, e.message)); }
  if (s.key) await page.keyboard.down(s.key);
  if (s.up) await page.keyboard.up(s.up);
  if (s.eval) console.log('eval', JSON.stringify(await page.evaluate(s.eval)));
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await shot(s.shot);
}
console.log(logs.slice(0, 50).join('\n'));
await browser.close();
