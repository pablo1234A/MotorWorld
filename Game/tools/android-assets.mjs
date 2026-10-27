// Regenerates Android launcher icons and splash screens from the MotorWorld brand mark.
import { createRequire } from 'module';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const res = new URL('../android/app/src/main/res/', import.meta.url).pathname;
const mark = (s, stroke) => `<svg viewBox="0 0 512 512" width="${s}" height="${s}"><path d="M96 340 L176 172 L256 300 L336 172 L416 340" fill="none" stroke="#e01a2b" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round"/><rect x="96" y="380" width="320" height="18" rx="9" fill="#eceef1"/></svg>`;
const html = {
  icon: (s, round) => `<div style="width:${s}px;height:${s}px;background:#0a0a0d;border-radius:${round ? '50%' : `${s * 0.18}px`};display:grid;place-items:center">${mark(s * 0.86, 44)}</div>`,
  fg: (s) => `<div style="width:${s}px;height:${s}px;display:grid;place-items:center">${mark(s * 0.55, 44)}</div>`,
  splash: (w, h) => `<div style="width:${w}px;height:${h}px;background:radial-gradient(ellipse at 70% 30%,#1a1014,#0a0a0d 60%);display:grid;place-items:center;font-family:Arial Narrow,Arial,sans-serif">
    <div style="text-align:center">${mark(Math.min(w, h) * 0.28, 44)}
    <div style="color:#eceef1;font-weight:700;font-size:${Math.min(w, h) * 0.09}px;letter-spacing:.06em;margin-top:${Math.min(w, h) * 0.02}px">MOTOR<span style="color:#e01a2b">WORLD</span></div>
    <div style="color:#93939d;font-size:${Math.min(w, h) * 0.03}px;letter-spacing:.5em">OPEN ROAD</div></div></div>`,
};
const b = await chromium.launch();
const p = await b.newPage();
for (const dir of readdirSync(res)) {
  for (const f of readdirSync(join(res, dir))) {
    if (!f.endsWith('.png')) continue;
    const path = join(res, dir, f);
    const buf = readFileSync(path);
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    let content;
    if (f === 'splash.png') content = html.splash(w, h);
    else if (f === 'ic_launcher_foreground.png') content = html.fg(w);
    else if (f === 'ic_launcher_round.png') content = html.icon(w, true);
    else if (f === 'ic_launcher.png') content = html.icon(w, false);
    else continue;
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<style>html,body{margin:0;background:transparent}</style>${content}`);
    await p.screenshot({ path, omitBackground: true });
  }
}
await b.close();
console.log('android assets regenerated');
