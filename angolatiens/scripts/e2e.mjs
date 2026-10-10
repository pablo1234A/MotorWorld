// Pruebas de navegador con Playwright contra el sitio servido en BASE (por defecto :8080).
// Uso: npm run serve (en otra terminal) y después: node scripts/e2e.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const BASE = process.env.BASE || 'http://localhost:8080';
const SHOTS = process.env.SHOTS || '';
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); else console.log('✓', msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(e.message));

// Buscador desde la portada
await page.goto(BASE + '/');
if (SHOTS) await page.screenshot({ path: SHOTS + '/home-desktop.png', fullPage: true });
await page.fill('#finder-q', 'quiero responder whatsapp de clientes gratis');
await Promise.all([page.waitForURL(/herramientas/), page.click('#finder button[type=submit]')]);
await page.waitForSelector('#finder-results .tool-item');
const first = await page.textContent('#finder-results .tool-item h3');
ok(/WhatsApp Business|ManyChat/.test(first), `buscador: primer resultado relevante (${first.trim()})`);
const allFree = await page.$$eval('#finder-results .tool-item', (els) => els.every((e) => e.textContent.includes('Plan gratuito')));
ok(allFree, 'buscador: "gratis" filtra a herramientas con plan gratuito');
ok(await page.isHidden('#default-list'), 'buscador: oculta el listado por defecto al mostrar resultados');

// Estado vacío
await page.fill('#finder-q', 'xyzzy plutonio');
await page.click('#finder button[type=submit]');
await page.waitForSelector('#finder-results .state');
ok((await page.textContent('#finder-results .state')).includes('No hemos encontrado'), 'buscador: estado vacío');

// Filtros sin texto
await page.fill('#finder-q', '');
await page.selectOption('#f-cat', 'automatizacion');
await page.waitForSelector('#finder-results .tool-item');
const n = await page.$$eval('#finder-results .tool-item', (e) => e.length);
ok(n === 3, `filtro categoría automatización: ${n} resultados`);
await page.check('#f-nontech');
await page.waitForFunction(() => document.querySelectorAll('#finder-results .tool-item').length === 2);
ok(true, 'filtro sin conocimientos técnicos excluye n8n');
await page.selectOption('#f-cat', '');
await page.uncheck('#f-nontech');
ok(await page.isVisible('#default-list'), 'sin filtros vuelve el listado completo');

// Comparador desde las fichas
await page.goto(BASE + '/herramientas/');
await page.click('[data-compare="make"]');
await page.click('[data-compare="zapier"]');
ok(await page.isVisible('#compare-bar'), 'barra de comparación visible tras seleccionar');
await Promise.all([page.waitForURL(/comparar/), page.click('#compare-go')]);
await page.waitForSelector('#compare-table table');
const heads = await page.$$eval('#compare-table thead th', (e) => e.map((x) => x.textContent.trim()));
ok(heads.includes('Make') && heads.includes('Zapier'), `comparador muestra ${heads.slice(1).join(', ')}`);
await page.selectOption('#cmp-3', 'n8n');
await page.waitForFunction(() => document.querySelectorAll('#compare-table thead th').length === 4);
ok(page.url().includes('h=make,zapier,n8n'), 'comparador actualiza la URL compartible');
if (SHOTS) await page.screenshot({ path: SHOTS + '/comparador.png', fullPage: true });

// Calculadoras
await page.goto(BASE + '/calculadoras/ahorro-automatizacion/');
const big1 = await page.textContent('[data-out="big"]');
ok(/€/.test(big1), `calculadora de ahorro calcula al cargar (${big1.trim()})`);
// 20×4 min×4,33/60 = 5,8 h; ×70 % = 4,0 h; ×25 € = 101 €; anual 1.213 €
ok(big1.replace(/\s/g, '').startsWith('1213'), 'calculadora de ahorro: valor esperado con supuestos por defecto');
await page.fill('#c-reduccion', '150');
ok(await page.isVisible('.calc-error'), 'calculadora: muestra error con valor fuera de rango');
await page.fill('#c-reduccion', '50');
ok(await page.isHidden('.calc-error'), 'calculadora: el error desaparece al corregir');
await page.goto(BASE + '/calculadoras/compensa-pagar/');
ok((await page.textContent('[data-out="minimo"]')).includes('55,2'), 'calculadora compensa: 23 € a 25 €/h = 55,2 min');
await page.goto(BASE + '/calculadoras/precio-hora-autonomo/');
ok((await page.textContent('[data-out="big"]')).includes('12,75'), 'calculadora precio hora: (36000-6000-3600)/2070 ≈ 12,75 €');

// Copiar prompt
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
await page.goto(BASE + '/plantillas/');
await page.click('.copy-btn');
await page.waitForFunction(() => document.querySelector('.copy-btn').textContent === 'Copiado', null, { timeout: 3000 }).catch(() => {});
ok((await page.evaluate(() => navigator.clipboard.readText())).startsWith('Actúa como'), 'botón copiar prompt copia el texto');
const dl = await page.request.get(BASE + '/plantillas/descargas/pack-prompts-angolatiens.txt');
ok(dl.ok(), 'descarga del pack de prompts disponible');

// 404
const r404 = await page.goto(BASE + '/no-existe/');
ok((await page.textContent('h1')).includes('No encontramos'), `página 404 personalizada (HTTP ${r404.status()})`);

// Móvil: sin scroll horizontal en todas las páginas clave
const mobile = await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true });
const mp = await mobile.newPage();
mp.on('pageerror', (e) => consoleErrors.push(e.message));
for (const p of ['/', '/herramientas/', '/herramientas/make/', '/comparar/?h=chatgpt,claude,gemini', '/guias/verifactu-autonomos-2027/', '/calculadoras/ahorro-automatizacion/', '/plantillas/', '/novedades/', '/negocios/restauracion/', '/privacidad/']) {
  await mp.goto(BASE + p);
  await mp.waitForLoadState('networkidle');
  const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `móvil sin desbordamiento horizontal: ${p}${over > 0 ? ' (+' + over + 'px)' : ''}`);
}
if (SHOTS) {
  await mp.goto(BASE + '/');
  await mp.screenshot({ path: SHOTS + '/home-mobile.png', fullPage: true });
  await mp.goto(BASE + '/guias/presupuestos-con-ia/');
  await mp.screenshot({ path: SHOTS + '/guia-mobile.png', fullPage: false });
}

const jsErrors = consoleErrors.filter((e) => !/status of 404/.test(e)); // el 404 provocado a propósito
ok(jsErrors.length === 0, 'sin errores de JavaScript' + (jsErrors.length ? ': ' + jsErrors.join(' | ') : ''));
await browser.close();
if (fails.length) { console.error('\nFALLOS:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('\nTodas las pruebas de navegador han pasado.');
