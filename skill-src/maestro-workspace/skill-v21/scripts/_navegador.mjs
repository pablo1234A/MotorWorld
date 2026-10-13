// Utilidades compartidas por test-juego.mjs y check-web.mjs.
// Requiere Playwright:  npm i -D playwright && npx playwright install chromium
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export async function loadPlaywright() {
  const tries = ['playwright', process.env.PLAYWRIGHT_PATH].filter(Boolean);
  for (const t of tries) { try { return await import(t.startsWith('/') ? pathToFileURL(path.join(t, 'index.mjs')).href : t); } catch {} }
  console.error('No encuentro Playwright. Instálalo con:\n  npm i -D playwright && npx playwright install chromium\n(o define PLAYWRIGHT_PATH=/ruta/a/node_modules/playwright)');
  process.exit(2);
}

export async function launch(pw) {
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
  try { return await pw.chromium.launch({ args }); } catch (e) {
    const cands = [process.env.CHROME_PATH, ...globDirs('/opt/pw-browsers', /^chromium-\d+$/).map(d => path.join(d, 'chrome-linux', 'chrome'))].filter(p => p && fs.existsSync(p));
    if (!cands.length) throw e;
    return pw.chromium.launch({ executablePath: cands[0], args });
  }
}
function globDirs(dir, re) { try { return fs.readdirSync(dir).filter(f => re.test(f)).map(f => path.join(dir, f)); } catch { return []; } }

export function toUrl(target) {
  if (/^https?:\/\//.test(target)) return target;
  return pathToFileURL(path.resolve(target)).href;
}

// Si la red bloquea la CDN (entornos aislados), sirve el paquete desde npm en una caché local.
const CACHE = path.join(os.tmpdir(), 'maestro-cdn-cache');
export async function cdnFallback(page) {
  await page.route(/https:\/\/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/.+/, async route => {
    const url = route.request().url();
    try { const r = await route.fetch(); if (r.status() < 400) return route.fulfill({ response: r }); } catch {}
    const m = url.match(/\/(?:npm\/)?((?:@[^/]+\/)?[^@/]+)@([^/]+)\/?([^?#]*)/);
    if (!m) return route.abort();
    const [, pkg, ver, rel] = m, dir = path.join(CACHE, `${pkg.replace('/', '__')}@${ver}`);
    try {
      if (!fs.existsSync(path.join(dir, 'node_modules', pkg))) execSync(`npm i -s --no-save --prefix "${dir}" ${pkg}@${ver}`, { stdio: 'ignore' });
      let fp = path.join(dir, 'node_modules', pkg, rel || '');
      if (!rel || fs.statSync(fp).isDirectory()) { const pj = JSON.parse(fs.readFileSync(path.join(dir, 'node_modules', pkg, 'package.json'), 'utf8')); fp = path.join(dir, 'node_modules', pkg, pj.module || pj.main || 'index.js'); }
      const type = fp.endsWith('.css') ? 'text/css' : fp.endsWith('.json') ? 'application/json' : fp.endsWith('.wasm') ? 'application/wasm' : 'application/javascript';
      return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(fp) });
    } catch { return route.abort(); }
  });
}

export function watchErrors(page) {
  const errors = [], warnings = [];
  page.on('pageerror', e => errors.push('JS: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') (/Failed to load resource|favicon|net::ERR/.test(m.text()) ? warnings : errors).push(m.text()); });
  page.on('requestfailed', r => warnings.push('No cargó: ' + r.url().slice(0, 120)));
  return { errors, warnings };
}

// Varianza de una captura (detecta pantallas negras o vacías) calculada dentro del navegador.
export async function imageStats(page, png) {
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 160, 90);
    const d = g.getImageData(0, 0, 160, 90).data; let s = 0, s2 = 0, n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; s2 += l * l; }
    const mean = s / n; return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
  }, png.toString('base64'));
}

export function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }
export const flag = name => process.argv.includes('--' + name);
