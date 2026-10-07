// End-to-end behaviour checks against the dev server: node tools/e2e.mjs
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
p.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + extra}`); };
const visibleCount = () => p.evaluate(() => [...document.querySelectorAll('.tile')].filter((t) => !t.hidden).length);

await p.goto('http://127.0.0.1:5173/#/');
await p.waitForFunction(() => document.getElementById('boot')?.classList.contains('is-gone'), null, { timeout: 90000 });
await p.waitForTimeout(800);

/* ----- catalog ----- */
await p.evaluate(() => document.getElementById('collection').scrollIntoView());
await p.waitForTimeout(600);
ok('catalog shows 8 residences', (await visibleCount()) === 8, await visibleCount());
await p.fill('input[name="q"]', 'ibiza'); await p.waitForTimeout(1600);
ok('search "ibiza" → 1', (await visibleCount()) === 1, await visibleCount());
ok('result text updates', (await p.textContent('.results')).trim() === '1 residence', await p.textContent('.results'));
await p.fill('input[name="q"]', ''); await p.waitForTimeout(1600);
await p.click('.chips[data-group="country"] .chip[data-value="Portugal"]'); await p.waitForTimeout(1600);
ok('country Portugal → 2', (await visibleCount()) === 2, await visibleCount());
await p.click('.chips[data-group="country"] .chip[data-value="All"]'); await p.waitForTimeout(1400);
await p.click('.chips[data-group="beds"] .chip[data-value="6"]'); await p.waitForTimeout(1600);
ok('bedrooms 6+ → 3 (Son Alba, Le Belvédère, Palm Crescent)', (await visibleCount()) === 3, await visibleCount());
await p.click('.chips[data-group="beds"] .chip[data-value="0"]'); await p.waitForTimeout(1400);
await p.evaluate(() => { const r = document.querySelector('input[name="maxPrice"]'); r.value = 8000000; r.dispatchEvent(new Event('input', { bubbles: true })); });
await p.waitForTimeout(1700);
ok('price ≤ €8M → 3 (Quinta, Finca, Casa Duna)', (await visibleCount()) === 3, await visibleCount());
await p.evaluate(() => { const r = document.querySelector('input[name="minArea"]'); r.value = 1000; r.dispatchEvent(new Event('input', { bubbles: true })); });
await p.waitForTimeout(1700);
ok('empty state appears', await p.isVisible('.empty'));
await p.click('.reset-all'); await p.waitForTimeout(1600);
ok('reset restores 8', (await visibleCount()) === 8, await visibleCount());
await p.selectOption('select[name="sort"]', 'priceDesc'); await p.waitForTimeout(1500);
const first = await p.evaluate(() => document.querySelector('.tile:not([hidden]) .tile__name').textContent);
ok('sort price high→low puts Le Belvédère first', first === 'Le Belvédère', first);

/* ----- viewing form (home) ----- */
await p.evaluate(() => document.getElementById('private-viewing').scrollIntoView());
await p.waitForTimeout(1200);
await p.click('.vform button[type="submit"]'); await p.waitForTimeout(300);
const errs = await p.$$eval('.field__err', (e) => e.map((x) => x.textContent).filter(Boolean));
ok('empty submit shows 5 errors', errs.length === 5, JSON.stringify(errs));
ok('focus moves to first invalid field', await p.evaluate(() => document.activeElement?.name === 'name'));
await p.fill('#vf-name', 'Ana Ruiz'); await p.fill('#vf-email', 'ana@'); await p.fill('#vf-phone', 'abc');
await p.selectOption('#vf-property', 'casa-onix');
const tomorrow = new Date(Date.now() + 864e5 * 10).toISOString().slice(0, 10);
await p.fill('#vf-date', tomorrow);
await p.click('.vform button[type="submit"]'); await p.waitForTimeout(300);
ok('bad email rejected', (await p.textContent('#vf-email-e')).length > 0);
ok('bad phone rejected', (await p.textContent('#vf-phone-e')).length > 0);
await p.fill('#vf-email', 'ana@example.com'); await p.fill('#vf-phone', '+34 600 123 456');
await p.click('.vform button[type="submit"]'); await p.waitForTimeout(1800);
ok('valid submit shows confirmation', await p.isVisible('.vdone'));
ok('confirmation names the residence', (await p.textContent('.vdone__list')).includes('Casa Ónix'));

/* ----- route to villa page via tile ----- */
await p.evaluate(() => document.getElementById('collection').scrollIntoView());
await p.waitForTimeout(500);
await p.click('.tile:not([hidden]) .tile__link');
await p.waitForFunction(() => location.hash.startsWith('#/villa/'), null, { timeout: 10000 });
await p.waitForFunction(() => document.body.dataset.page === 'villa' && !document.querySelector('.curtain.is-up'), null, { timeout: 20000 });
ok('tile opens a villa page', await p.isVisible('.vhero__h'));
const title = await p.title();
ok('document title updates', /Solenne/.test(title) && !/Private residences on the Mediterranean$/.test(title), title);

/* ----- villa interactions ----- */
await p.evaluate(() => document.querySelector('.vgal').scrollIntoView());
await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('.vgal__btn').click());
await p.waitForTimeout(700);
ok('lightbox opens', await p.evaluate(() => document.querySelector('.lightbox').open));
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
ok('lightbox caption advances', (await p.textContent('.lightbox figcaption')).includes('2 /'), await p.textContent('.lightbox figcaption'));
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
ok('lightbox closes on Esc', await p.evaluate(() => !document.querySelector('.lightbox').open));

await p.evaluate(() => document.querySelector('.vtime').scrollIntoView());
await p.waitForTimeout(800);
await p.evaluate(() => { const r = document.querySelector('.vtime input'); r.value = 200; r.dispatchEvent(new Event('input', { bubbles: true })); });
await p.waitForTimeout(300);
const nightOp = await p.evaluate(() => getComputedStyle(document.querySelector('[data-l="night"]')).opacity);
ok('day/night slider reveals night layer', parseFloat(nightOp) > 0.95, nightOp);
ok('clock label shows night', (await p.textContent('.vtime__name')) === 'Night');
await p.click('.vtime__stop[data-t="0"]'); await p.waitForTimeout(1900);
ok('stop button animates back to day', (await p.textContent('.vtime__name')) === 'Day');

await p.evaluate(() => document.querySelector('.vplan').scrollIntoView());
await p.waitForTimeout(600);
await p.click('.vplan__floors button[data-floor="upper"]'); await p.waitForTimeout(500);
ok('plan switches to upper floor', (await p.$$eval('.vplan__svg .room', (r) => r.map((x) => x.dataset.id))).includes('suite'));
await p.click('.vplan__svg .room[data-id="bath"]'); await p.waitForTimeout(500);
ok('selecting a room updates the card', (await p.textContent('.vplan__name')) === 'Bathroom');
await p.focus('.vplan__svg .room[data-id="balcony"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
ok('rooms are keyboard operable', (await p.textContent('.vplan__name')) === 'Sunrise balcony');

await p.evaluate(() => document.querySelector('.vloc').scrollIntoView());
await p.waitForTimeout(500);
await p.hover('.poi[data-i="2"]'); await p.waitForTimeout(300);
ok('hover on a place highlights its map pin', await p.evaluate(() => document.querySelector('.pin[data-i="2"]').classList.contains('is-on')));

/* ----- back to collection, header links ----- */
await p.click('.vhero__back, a[data-home]').catch(() => {});
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400);
await p.click('.vhero__back'); await p.waitForTimeout(4500);
ok('"All residences" returns to the collection', await p.evaluate(() => document.body.dataset.page === 'home' && Math.abs(document.getElementById('collection').getBoundingClientRect().top) < 80), await p.evaluate(() => document.getElementById('collection')?.getBoundingClientRect().top));

console.log(`\n${pass} passed, ${fail} failed`);
const real = errors.filter((e) => !/THREE\.|preload/.test(e));
console.log(real.length ? 'Console/network problems:\n' + [...new Set(real)].join('\n') : 'No console errors.');
await b.close();
