import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await p.mouse.click(480, 270);
await p.waitForTimeout(1500);
await p.click('.mitem.primary');
for (const [x, z] of [[560, -70], [650, 0], [300, 300], [-600, 100]]) {
  await p.evaluate(([x, z]) => window.__game.travelTo(x, z), [x, z]);
  await p.waitForTimeout(5000);
  const r = await p.evaluate(() => { const g = window.__game; g.world.occlusion.enabled = false; return 1; });
  await p.waitForTimeout(1500);
  const off = await p.evaluate(() => window.__game.renderer.info.render.calls);
  await p.evaluate(() => { window.__game.world.occlusion.enabled = true; });
  await p.waitForTimeout(1500);
  const on = await p.evaluate(() => ({ calls: window.__game.renderer.info.render.calls, culled: window.__game.world.occlusion.culled, chunks: window.__game.world.loadedChunks }));
  console.log(x, z, 'calls without occlusion', off, 'with', on.calls, 'culled chunks', on.culled, '/', on.chunks);
  await p.screenshot({ path: `/tmp/claude-0/-home-user-MotorWorld/8f9660f5-87d2-5e83-9df8-bcad724524a3/scratchpad/occl_${x}.png` });
}
await b.close();
