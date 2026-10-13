#!/usr/bin/env node
// Revisión automática de una web: errores, responsive (360/768/1280/1920), desbordes con el elemento culpable,
// accesibilidad básica, contraste, SEO, rendimiento (LCP/CLS) y capturas. Pensado para pasarlo ANTES de entregar.
//
// Uso:  node scripts/check-web.mjs <archivo.html|URL> [--out carpeta]
// Sale con código 1 si hay fallos graves (errores JS, desbordes, falta de h1/title, imágenes sin alt...).
import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright, launch, toUrl, cdnFallback, watchErrors, arg } from './_navegador.mjs';

const target = process.argv[2];
if (!target || target.startsWith('--')) { console.log('Uso: node scripts/check-web.mjs <archivo.html|URL> [--out carpeta]'); process.exit(2); }
const out = arg('out', path.join(path.dirname(path.resolve(target.startsWith('http') ? '.' : target)), 'check-web'));
fs.mkdirSync(out, { recursive: true });

const pw = await loadPlaywright();
const browser = await launch(pw);
const results = [];
const R = (sev, name, pass, detail = '') => results.push({ sev, name, pass: !!pass, detail: String(detail) });   // sev: grave | mejora

async function open(width, height = 900, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage(); await cdnFallback(page);
  const errs = watchErrors(page);
  await page.goto(toUrl(target), { waitUntil: 'load', timeout: 60000 }).catch(e => errs.errors.push('Carga: ' + e.message));
  await page.waitForTimeout(1200);
  // Recorre la página para disparar animaciones de entrada y carga diferida
  await page.evaluate(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += innerHeight * 0.7) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); });
  await page.waitForTimeout(600);
  return { ctx, page, ...errs };
}

// 1. Responsive y desbordes
const allErrors = new Set();
for (const w of [360, 768, 1280, 1920]) {
  const { ctx, page, errors } = await open(w, w < 800 ? 780 : 900, w === 360 ? { isMobile: true, hasTouch: true } : {});
  errors.forEach(e => allErrors.add(e));
  const ov = await page.evaluate(() => {
    const W = document.documentElement.clientWidth, bad = [];
    if (document.documentElement.scrollWidth <= W + 1) return { over: false, bad };
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (r.right > W + 1 && r.width > 0 && cs.position !== 'fixed' && !el.closest('[style*="overflow"]')) {
        let p = el.parentElement, clipped = false; while (p) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') { clipped = true; break; } p = p.parentElement; }
        if (!clipped) bad.push((el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + ` (sale ${Math.round(r.right - W)}px)`);
      }
      if (bad.length > 4) break;
    }
    if (!bad.length) for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.right > W + 1) { bad.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') + ` (${getComputedStyle(el).position}, sale ${Math.round(r.right - W)}px)`); if (bad.length > 3) break; } }
    return { over: true, bad };
  });
  R('grave', `Sin scroll horizontal a ${w}px`, !ov.over, ov.bad.join(', '));
  // Capturas de pantalla (no de página completa: Chromium repite contenido por encima de ~8.000 px)
  if (w === 360 || w === 1280) {
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (const [k, f] of [['arriba', 0], ['medio', 0.45], ['abajo', 1]]) { await page.evaluate(y => scrollTo(0, y), Math.round((total - 900) * f)); await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, `${w}-${k}.png`) }); }
    await page.evaluate(() => scrollTo(0, 0));
  } else await page.screenshot({ path: path.join(out, `${w}.png`) });
  if (w === 360) {
    const m = await page.evaluate(() => {
      const small = [...document.querySelectorAll('a, button, [role=button], input, select, textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40) && getComputedStyle(e).display !== 'inline'; });
      const zoomInputs = [...document.querySelectorAll('input, select, textarea')].filter(e => parseFloat(getComputedStyle(e).fontSize) < 16);
      const tinyText = [...document.querySelectorAll('p, li, span, a')].filter(e => e.textContent.trim().length > 20 && parseFloat(getComputedStyle(e).fontSize) < 13);
      return { small: small.length, zoom: zoomInputs.length, tiny: tinyText.length };
    });
    R('mejora', 'Zonas táctiles de al menos 40×40 px en móvil', m.small === 0, `${m.small} elementos pequeños`);
    R('grave', 'Campos de formulario ≥16px (evita el zoom de iOS)', m.zoom === 0, `${m.zoom} campos con letra pequeña`);
    R('mejora', 'Texto legible en móvil (≥13px)', m.tiny === 0, `${m.tiny} bloques con letra muy pequeña`);
  }
  await ctx.close();
}
R('grave', 'Sin errores de JavaScript', allErrors.size === 0, [...allErrors].slice(0, 4).join(' | '));

// 2. Accesibilidad, SEO y contenido (a 1280px)
const { ctx, page } = await open(1280);
const a = await page.evaluate(() => {
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const name = e => (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || e.querySelector('img[alt]')?.alt || '').trim();
  const labelled = e => e.id && q(`label[for="${e.id}"]`) || e.closest('label') || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.type === 'hidden' || e.type === 'submit';
  const css = [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
  // Contraste aproximado: color del texto contra el primer fondo sólido de sus ancestros
  const parse = c => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let low = [], checked = 0;
  for (const el of qa('h1,h2,h3,p,li,a,button,span,label')) {
    if (!el.textContent.trim() || el.children.length > 2) continue; const r = el.getBoundingClientRect(); if (!r.width) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.5) continue;
    let p = el, bg = null; while (p) { const b = getComputedStyle(p); if (b.backgroundImage !== 'none') { bg = null; break; } const c = parse(b.backgroundColor); if (c && (c[3] === undefined || c[3] > 0.9)) { bg = c; break; } p = p.parentElement; }
    if (!bg) continue; const fg = parse(cs.color); if (!fg || (fg[3] !== undefined && fg[3] < 0.5) || parseFloat(cs.webkitTextStrokeWidth) > 0) continue; checked++;
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.6 && +cs.fontWeight >= 700);
    if (ratio < (big ? 3 : 4.5)) low.push(`"${el.textContent.trim().slice(0, 24)}" ${ratio.toFixed(1)}:1`);
  }
  return {
    lang: document.documentElement.lang, title: document.title, desc: q('meta[name=description]')?.content || '', viewport: !!q('meta[name=viewport]'),
    og: !!q('meta[property="og:title"]') && !!q('meta[property="og:image"]'), jsonld: qa('script[type="application/ld+json"]').length,
    h1: qa('h1').length, imgNoAlt: qa('img:not([alt])').length, imgNoSize: qa('img:not([width]):not([height])').filter(i => !i.style.aspectRatio).length,
    btnNoName: qa('button, a[href], [role=button]').filter(e => !name(e)).length, inputNoLabel: qa('input, select, textarea').filter(e => !labelled(e)).length,
    reduced: /prefers-reduced-motion/.test(css), focusRule: /:focus-visible|:focus/.test(css), low: low.slice(0, 5), lowN: low.length, checked,
    placeholder: /lorem ipsum/i.test(document.body.innerText) || /\bTODO\b|\bTBD\b|\bFIXME\b/.test(document.body.innerText),
  };
});
R('grave', 'Atributo lang en <html>', a.lang, a.lang || 'falta');
R('grave', 'Título de la página', a.title.length >= 10 && a.title.length <= 65, `"${a.title}" (${a.title.length} caracteres; ideal 30–60)`);
R('mejora', 'Meta description (110–160 caracteres)', a.desc.length >= 110 && a.desc.length <= 170, `${a.desc.length} caracteres`);
R('grave', 'Meta viewport', a.viewport);
R('mejora', 'Open Graph (og:title + og:image) para compartir', a.og);
R('mejora', 'Datos estructurados JSON-LD', a.jsonld > 0, `${a.jsonld} bloques`);
R('grave', 'Exactamente un h1', a.h1 === 1, `${a.h1} h1`);
R('grave', 'Todas las imágenes con alt', a.imgNoAlt === 0, `${a.imgNoAlt} sin alt`);
R('mejora', 'Imágenes con dimensiones (evita saltos de diseño)', a.imgNoSize === 0, `${a.imgNoSize} sin width/height`);
R('grave', 'Botones y enlaces con nombre accesible', a.btnNoName === 0, `${a.btnNoName} sin texto ni aria-label`);
R('grave', 'Campos de formulario con etiqueta', a.inputNoLabel === 0, `${a.inputNoLabel} sin label`);
R('grave', 'Respeta prefers-reduced-motion', a.reduced);
R('grave', 'Estilos de foco visibles', a.focusRule);
R('mejora', 'Contraste de texto AA', a.lowN === 0, a.lowN ? `${a.lowN} de ${a.checked}: ${a.low.join(', ')}` : `${a.checked} textos revisados`);
R('grave', 'Sin texto de relleno (lorem, TODO)', !a.placeholder);

// Foco con teclado: tras pulsar Tab, el elemento enfocado debe verse distinto
await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
const focus = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'nada enfocable';
  const cs = getComputedStyle(e); return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' ? 'ok' : `${e.tagName.toLowerCase()} sin indicador`; });
R('grave', 'El foco de teclado se ve', focus === 'ok', focus);

// 3. Rendimiento (aproximado, sin limitar red ni CPU)
const perf = await page.evaluate(() => new Promise(res => {
  let lcp = 0, cls = 0;
  new PerformanceObserver(l => { for (const e of l.getEntries()) lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  setTimeout(() => res({ lcp, cls, bytes: performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0) }), 1500);
}));
R('mejora', 'LCP < 2,5 s (en local, sin limitar red)', perf.lcp < 2500, `${Math.round(perf.lcp)} ms`);
R('grave', 'CLS < 0,1 (sin saltos de diseño)', perf.cls < 0.1, perf.cls.toFixed(3));
await ctx.close();

// 4. Modo oscuro y movimiento reducido: la página debe seguir viéndose
const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
const dp = await dark.newPage(); await cdnFallback(dp); await dp.goto(toUrl(target), { waitUntil: 'load' }).catch(() => {}); await dp.waitForTimeout(800);
const hidden = await dp.evaluate(() => [...document.querySelectorAll('h1,h2,p')].filter(e => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.width && +getComputedStyle(e).opacity < 0.1; }).length);
R('grave', 'Con movimiento reducido el contenido es visible (sin depender de animaciones)', hidden === 0, `${hidden} textos invisibles en pantalla`);
await dp.screenshot({ path: path.join(out, 'oscuro-reducido.png') }); await dark.close();
await browser.close();

// Informe
console.log(`\nREVISIÓN WEB · ${target}\n`);
for (const sev of ['grave', 'mejora']) {
  console.log(sev === 'grave' ? 'IMPRESCINDIBLE' : 'RECOMENDADO');
  for (const r of results.filter(x => x.sev === sev)) console.log(`  ${r.pass ? '✅' : sev === 'grave' ? '❌' : '⚠️ '} ${r.name}${r.detail && !r.pass ? ' — ' + r.detail : ''}`);
}
const fails = results.filter(r => !r.pass && r.sev === 'grave');
console.log(`\n${fails.length ? `❌ ${fails.length} fallos imprescindibles` : '✅ Sin fallos imprescindibles'} · capturas en ${out}`);
fs.writeFileSync(path.join(out, 'resultado.json'), JSON.stringify({ target, results, perf }, null, 1));
process.exit(fails.length ? 1 : 0);
