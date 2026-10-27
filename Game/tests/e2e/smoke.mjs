// End-to-end smoke test: boot -> menu -> drive -> tune -> race -> save -> reload -> progress persists.
// Usage: npm run e2e  (expects a dev or preview server on BASE, default http://localhost:5173/)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }

const BASE = process.env.BASE || 'http://localhost:5173/';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function boot() {
  await page.goto(BASE);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000, polling: 500 });
  await page.mouse.click(480, 270);
  await page.waitForFunction(() => window.__game?.ui.current === 'menu', null, { timeout: 30000 });
}

await boot();
check('boots to main menu', true);
await page.evaluate(() => localStorage.length);

// --- drive ---
await page.click('.mitem.primary');
await page.waitForFunction(() => window.__game.ui.current === null);
await page.keyboard.down('ArrowUp');
// software GL in CI is slow: wait on simulation state rather than wall time
await page.waitForFunction(() => window.__game.player.sim.forwardSpeed * 3.6 > 40, null, { timeout: 240000, polling: 500 }).catch(() => {});
await page.keyboard.up('ArrowUp');
const drive = await page.evaluate(() => { const s = window.__game.player.sim; return { kmh: s.forwardSpeed * 3.6, y: s.position.y, flipped: s.isFlipped }; });
check('car accelerates under keyboard control', drive.kmh > 20, JSON.stringify(drive));
check('car stays upright on the road', !drive.flipped && drive.y > 0);

// --- tuning changes physics ---
const tune = await page.evaluate(() => {
  const g = window.__game;
  const p = g.profile;
  p.addCash(200000);
  const before = g.player.sim.spec.engine.peakTorque;
  const ok = p.installPart(p.currentCar, 'turbo', 2) && p.installPart(p.currentCar, 'ecu', 3);
  g.refreshPlayerCar();
  const after = g.player.sim.spec.engine.peakTorque;
  p.flush();
  return { ok, before, after, cash: p.data.cash };
});
check('buying parts changes the physical spec', tune.ok && tune.after > tune.before, JSON.stringify(tune));

// --- race ---
await page.evaluate(() => window.__game.startEvent('e_mile'));
await page.waitForTimeout(1500);
const race = await page.evaluate(() => ({ state: window.__game.race?.state, n: window.__game.race?.racers.length }));
check('event session starts', race.state === 'countdown' || race.state === 'racing', JSON.stringify(race));
await page.keyboard.down('ArrowUp');
await page.waitForFunction(() => (window.__game.race?.hud().time ?? 0) > 2, null, { timeout: 240000, polling: 500 }).catch(() => {});
await page.keyboard.up('ArrowUp');
const racing = await page.evaluate(() => window.__game.race?.hud());
check('race progresses', racing && racing.time > 0, JSON.stringify({ time: racing?.time, score: racing?.score }));
await page.evaluate(() => window.__game.quitEvent());

// --- persistence across reload ---
const saved = await page.evaluate(() => { const p = window.__game.profile; p.flush(); return { cash: p.data.cash, turbo: p.currentCar.parts.turbo }; });
await page.reload();
await boot();
const loaded = await page.evaluate(() => { const p = window.__game.profile; return { cash: p.data.cash, turbo: p.currentCar.parts.turbo, isNew: p.isNew }; });
check('progress persists after closing the app', !loaded.isNew && loaded.cash === saved.cash && loaded.turbo === 2, JSON.stringify({ saved, loaded }));

check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
