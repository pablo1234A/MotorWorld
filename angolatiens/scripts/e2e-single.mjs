// Pruebas del archivo único angolatiens.html abierto con file:// (sin servidor).
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const FILE = pathToFileURL(join(dirname(dirname(fileURLToPath(import.meta.url))), 'angolatiens.html')).href;
const SHOTS = process.env.SHOTS || '';
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); else console.log('✓', m); };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (r) => errors.push('petición fallida: ' + r.url()));

await page.goto(FILE);
ok((await page.textContent('#view h2')).includes('responder'), 'portada se muestra');
if (SHOTS) await page.screenshot({ path: SHOTS + '/single-home.png' });

// Navegación por enlaces estáticos
await page.click('.mainnav a[href="#/guias/"]');
await page.waitForFunction(() => location.hash === '#/guias/');
ok((await page.textContent('#view h1')).includes('Guías'), 'navegación a Guías');
ok((await page.getAttribute('.mainnav a[href="#/guias/"]', 'aria-current')) === 'page', 'menú marca la sección activa');
await page.click('#view .card h3 a');
await page.waitForSelector('#view .prose h2');
ok((await page.$$('#view .prose h2')).length > 2, 'abre una guía');
ok((await page.$$('#view .copy-btn')).length > 0, 'botones de copiar en la guía');

// Buscador desde la portada
await page.goto(FILE + '#/');
await page.fill('#finder-q', 'hacer presupuestos');
await page.click('#finder button[type=submit]');
await page.waitForSelector('#finder-results .tool-item');
ok(page.url().includes('#/herramientas/?q='), 'búsqueda navega a herramientas con la consulta');
const names = await page.$$eval('#finder-results .tool-item h3', (e) => e.map((x) => x.textContent));
ok(names.length > 0, 'resultados: ' + names.slice(0, 3).join(', '));
// Enlace dinámico (resultado) interceptado
await page.click('#finder-results .tool-item h3 a');
await page.waitForFunction(() => (document.querySelector('#view h1') || {}).textContent.includes('para qué le sirve'));
ok((await page.textContent('#view h1')).includes('para qué le sirve'), 'ficha de herramienta desde resultado');

// Comparador
await page.goto(FILE + '#/herramientas/');
await page.click('[data-compare="chatgpt"]');
await page.click('[data-compare="claude"]');
await page.click('#compare-go');
await page.waitForSelector('#compare-table table');
ok((await page.$$('#compare-table thead th')).length >= 3, 'comparador con las herramientas seleccionadas');

// Calculadora
await page.goto(FILE + '#/calculadoras/ahorro-automatizacion/');
await page.waitForSelector('[data-out="big"]');
ok((await page.textContent('[data-out="big"]')).includes('€'), 'calculadora funciona');

// Descarga incrustada y ancla interna
await page.goto(FILE + '#/plantillas/');
const dl = await page.getAttribute('a[download="pack-prompts-angolatiens.txt"]', 'href');
ok(dl && dl.startsWith('data:text/plain'), 'descarga incrustada como data URI');
await page.goto(FILE + '#/novedades/#make-creditos');
await page.waitForTimeout(100);
ok(await page.evaluate(() => window.scrollY > 0), 'ancla dentro de una página');

// 404
await page.goto(FILE + '#/no-existe/');
ok((await page.textContent('#view h1')).includes('No encontramos'), 'ruta inexistente muestra 404');

// Móvil
const m = await (await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true })).newPage();
for (const h of ['#/', '#/comparar/?h=make,zapier,n8n', '#/guias/verifactu-autonomos-2027/']) {
  await m.goto(FILE + h);
  await m.waitForTimeout(100);
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'móvil sin desbordamiento ' + h);
}
ok(errors.length === 0, 'sin errores ni peticiones externas' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
if (fails.length) { console.error('\nFALLOS:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('\nEl archivo único funciona correctamente.');
