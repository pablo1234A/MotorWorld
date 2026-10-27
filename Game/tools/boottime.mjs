import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
for (let k = 0; k < 2; k++) {
  const t0 = Date.now(); p.removeAllListeners('console'); p.on('console', m => m.text().includes('MotorWorld') && console.log('   ', m.text()));
  await p.goto('http://localhost:5173/');
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  console.log('boot', k, Date.now() - t0, 'ms');
}
await b.close();
