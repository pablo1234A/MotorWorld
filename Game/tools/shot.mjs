// Usage: node tools/shot.mjs <url> <out.png> [maxWaitMs] [w] [h]
// Waits for window.__ready (set by the page) then screenshots.
import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const [url, out, wait = '60000', w = '1280', h = '720'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
const t0 = Date.now();
try {
  await page.waitForFunction(() => window.__ready === true, null, { timeout: +wait, polling: 250 });
} catch (e) {
  logs.push('[shot] timeout waiting for __ready');
}
console.log(`ready after ${Date.now() - t0}ms`);
await page.screenshot({ path: out, timeout: 120000 });
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
