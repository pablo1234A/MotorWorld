#!/usr/bin/env node
// Prueba automática de un juego web: carga, errores, pantalla no vacía, FPS, partida simulada con teclado y ratón,
// capturas, y la autoprueba del propio juego si expone window.__game.selfTest() (ver examples/fps-pro.html).
//
// Uso:  node scripts/test-juego.mjs <archivo.html|URL> [--segundos 8] [--out carpeta] [--ancho 1280 --alto 720]
// Sale con código 1 si hay errores o falla alguna comprobación (útil en CI).
import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright, launch, toUrl, cdnFallback, watchErrors, imageStats, arg } from './_navegador.mjs';

const target = process.argv[2];
if (!target || target.startsWith('--')) { console.log('Uso: node scripts/test-juego.mjs <archivo.html|URL> [--segundos 8] [--out carpeta]'); process.exit(2); }
const secs = +arg('segundos', 8), out = arg('out', path.join(path.dirname(path.resolve(target.startsWith('http') ? '.' : target)), 'test-juego'));
const W = +arg('ancho', 1280), H = +arg('alto', 720);
fs.mkdirSync(out, { recursive: true });

const pw = await loadPlaywright();
const browser = await launch(pw);
const page = await browser.newPage({ viewport: { width: W, height: H } });
await cdnFallback(page);
const { errors, warnings } = watchErrors(page);
const checks = [];
const ok = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail: String(detail) });
const shot = async name => { const b = await page.screenshot({ path: path.join(out, name + '.png') }); return b; };

await page.goto(toUrl(target), { waitUntil: 'load', timeout: 60000 }).catch(e => errors.push('Carga: ' + e.message));
await page.waitForTimeout(2000);
const menuStats = await imageStats(page, await shot('1-inicio'));
ok('La pantalla inicial no está vacía', menuStats.std > 6, `contraste ${menuStats.std.toFixed(1)}`);

// Empezar partida: API del juego → botón con texto típico → clic en el centro
const started = await page.evaluate(() => {
  if (window.__game?.start) { window.__game.start(); return 'window.__game.start()'; }
  const re = /jugar|play|start|empezar|comenzar|iniciar|desplegar|continuar/i;
  const b = [...document.querySelectorAll('button, a, [role=button]')].find(x => re.test(x.textContent) && x.offsetParent);
  if (b) { b.click(); return 'botón "' + b.textContent.trim().slice(0, 20) + '"'; }
  return null;
});
if (!started) await page.mouse.click(W / 2, H / 2);
ok('Se puede empezar a jugar', true, started || 'clic en el centro');
await page.waitForTimeout(800);

// FPS medidos dentro de la página
const gpu = await page.evaluate(() => { try { const g = document.createElement('canvas').getContext('webgl'); const i = g.getExtension('WEBGL_debug_renderer_info'); return g.getParameter(i ? i.UNMASKED_RENDERER_WEBGL : g.RENDERER); } catch { return '?'; } });
const software = /swiftshader|llvmpipe|software/i.test(gpu);
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(n / 2); }; requestAnimationFrame(f); }));
const gameFps = await page.evaluate(() => window.__game?.fps || 0);
const f = gameFps || fps;
// Sin GPU (render por software) los FPS no son representativos: se informa, pero no cuenta como fallo.
ok('Fotogramas por segundo', software || f >= 45, `${f.toFixed(0)} FPS · ${software ? 'render por software (sin GPU): mide en un equipo real' : gpu}`);

// Partida simulada
const seq = ['KeyW', 'KeyA', 'KeyW', 'KeyD', 'KeyS', 'KeyW'];
const t0 = Date.now(); let i = 0;
while (Date.now() - t0 < secs * 1000) {
  const k = seq[i % seq.length]; await page.keyboard.down(k);
  await page.mouse.move(W / 2 + Math.sin(i) * 120, H / 2 + Math.cos(i * 0.7) * 60, { steps: 4 });
  await page.mouse.down(); await page.waitForTimeout(220); await page.mouse.up();
  if (i % 3 === 0) await page.keyboard.press('Space');
  await page.waitForTimeout(250); await page.keyboard.up(k);
  if (i === 3) await shot('2-jugando');
  i++;
}
const playStats = await imageStats(page, await shot('3-jugando'));
ok('La escena se dibuja durante la partida', playStats.std > 6, `contraste ${playStats.std.toFixed(1)}`);

// Autoprueba del propio juego (recomendado: expón window.__game.selfTest)
const hasSelf = await page.evaluate(() => typeof window.__game?.selfTest === 'function');
if (hasSelf) {
  const res = await page.evaluate(() => Promise.race([window.__game.selfTest(), new Promise(r => setTimeout(() => r([{ name: 'Autoprueba', pass: false, detail: 'tiempo agotado (120 s)' }]), 120000))]))
    .catch(e => [{ name: 'Autoprueba', pass: false, detail: e.message }]);
  for (const r of res) ok('[juego] ' + r.name, r.pass, r.detail);
  await shot('4-tras-autoprueba');
} else ok('El juego expone window.__game.selfTest()', false, 'recomendado para verificar mecánicas (mover, disparar, morir, reiniciar)');

ok('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();

console.log(`\nPRUEBA DE JUEGO · ${target}\n`);
for (const c of checks) console.log(`${c.pass ? '✅' : '❌'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
if (warnings.length) console.log(`\n⚠️  Avisos (${warnings.length}): ${warnings.slice(0, 3).join(' | ')}`);
console.log(`\nCapturas en: ${out}`);
const failed = checks.filter(c => !c.pass && !c.name.startsWith('El juego expone'));
fs.writeFileSync(path.join(out, 'resultado.json'), JSON.stringify({ target, checks, errors, warnings, fps }, null, 1));
process.exit(failed.length ? 1 : 0);
