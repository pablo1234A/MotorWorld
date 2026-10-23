/* =====================================================================
 * Genera las imágenes para redes (1200×630) y los iconos de la app a
 * partir de plantillas HTML con la identidad de RÉTAME.
 *   npm run og      → src/static/og/*.png, src/static/icons/*.png
 * Vuelve a ejecutarlo cuando añadas retos o categorías.
 * =================================================================== */
import fs from "node:fs";
import path from "node:path";
import { loadEngine, ROOT } from "./load.mjs";
import { getChromium } from "./playwright.mjs";

const E = loadEngine();
const STATIC = path.join(ROOT, "src", "static");
const OG = path.join(STATIC, "og"), ICONS = path.join(STATIC, "icons");
fs.mkdirSync(OG, { recursive: true }); fs.mkdirSync(ICONS, { recursive: true });
const fontUrl = "file://" + path.join(STATIC, "fonts", "bricolage-grotesque-latin.woff2");
const { esc, icon, brandMark } = E;

const css = `
@font-face { font-family: B; src: url(${fontUrl}) format("woff2"); font-weight: 600 800; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; background: #1D0B57; color: #fff; font-family: B, system-ui, sans-serif; position: relative; }
.rings { position: absolute; right: -250px; top: -250px; width: 640px; height: 640px; border-radius: 50%;
  background: radial-gradient(circle, transparent 0 86px, rgba(255,255,255,.07) 86px 92px, transparent 92px 166px, rgba(255,255,255,.07) 166px 172px, transparent 172px 246px, #FFC53D 246px 251px, transparent 254px); }
.dot { position: absolute; right: 62px; top: 62px; width: 34px; height: 34px; border-radius: 50%; background: #FFC53D; }
.pad { position: absolute; inset: 64px 72px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 16px; font-weight: 800; font-size: 40px; letter-spacing: -1.5px; }
.chip { align-self: flex-start; display: inline-flex; align-items: center; gap: 10px; padding: 10px 20px; border-radius: 999px; background: #FFC53D; color: #1A1300; font-weight: 800; font-size: 26px; letter-spacing: .5px; text-transform: uppercase; }
.chip svg { width: 28px; height: 28px; }
h1 { font-weight: 800; letter-spacing: -3px; line-height: .98; }
.amber { color: #FFC53D; }
.sub { color: #D9CEFF; font-size: 32px; line-height: 1.3; font-family: system-ui, sans-serif; font-weight: 500; }
.sq { display: flex; gap: 14px; }
.sq i { width: 64px; height: 64px; border-radius: 14px; display: grid; place-items: center; }
.sq i svg { width: 34px; height: 34px; color: #fff; }
.v { background: #1FA463; } .m { background: #F2B705; } .x { background: #E5484D; } .e { background: rgba(255,255,255,.1); border: 2px solid rgba(255,255,255,.18); }
.m svg { color: #1A1300 !important; }
.foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; font-size: 26px; color: #CFC3FF; font-family: system-ui, sans-serif; font-weight: 600; }
.foot .brand { font-size: 30px; color: #fff; font-family: B, system-ui; gap: 12px; }
.tile { width: 132px; height: 132px; border-radius: 34px; display: grid; place-items: center; background: #fff; }
.tile svg { width: 76px; height: 76px; }
.dots { display: flex; gap: 8px; } .dots b { width: 18px; height: 18px; border-radius: 6px; background: rgba(255,255,255,.22); } .dots b.on { background: #FFC53D; }
`;
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="rings"></div><div class="dot"></div><div class="pad">${body}</div></body></html>`;
const squares = (g) => `<div class="sq">${g.split("").map((c) => `<i class="${c === "v" ? "v" : c === "~" ? "m" : c === "x" ? "x" : "e"}">${c === "e" ? "" : icon(c === "v" ? "check" : c === "~" ? "target" : "x")}</i>`).join("")}</div>`;
const lockup = (s = 46) => `<div class="brand">${brandMark(s)}RÉTAME</div>`;
const foot = (left) => `<div class="foot"><span>${left}</span>${lockup(44).replace('class="brand"', 'class="brand"')}</div>`;

const jobs = [];
jobs.push(["retame", page(`${lockup(64)}
<h1 style="font-size:96px;margin-top:56px">Un reto nuevo<br>cada día. <span class="amber">¿Cuánto<br>sacas hoy?</span></h1>
<div style="margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between">${squares("vv~vx")}<span class="sub" style="font-size:28px">Lógica · Memoria · Números · Trivia</span></div>`)]);
jobs.push(["reto-del-dia", page(`<span class="chip">${icon("calendar")}Reto del día</span>
<h1 style="font-size:92px;margin-top:40px">Cinco pruebas.<br>Dos minutos.<br><span class="amber">Una puntuación.</span></h1>
${foot("Mismo reto para todo el mundo")}`)]);
jobs.push(["duelo", page(`<span class="chip">${icon("duel")}Duelo</span>
<h1 style="font-size:104px;margin-top:40px">Te han retado.<br><span class="amber">¿Puedes<br>superarlo?</span></h1>
${foot("Juega el mismo reto y descubre quién gana")}`)]);
for (const c of E.PUBLIC_CATS) {
  const n = E.PUBLIC_CHALLENGES.filter((x) => x.cat === c.slug).length;
  jobs.push(["cat-" + c.slug, page(`<div class="tile" style="color:${c.color}">${icon(c.icon)}</div>
<h1 style="font-size:84px;margin-top:40px;max-width:900px">${esc(c.h1)}</h1>
<p class="sub" style="margin-top:20px;max-width:880px">${esc(c.short)}</p>
${foot(n + " retos con solución · gratis")}`)]);
}
for (const ch of E.PUBLIC_CHALLENGES) {
  const c = E.catBySlug[ch.cat], len = ch.title.length;
  const size = len < 22 ? 96 : len < 34 ? 84 : len < 46 ? 72 : 62;
  jobs.push(["reto-" + ch.slug, page(`<span class="chip" style="background:#fff;color:${c.color}">${icon(c.icon)}${esc(c.name)}${ch.topic ? " · " + esc(E.TOPICS[ch.topic]) : ""}</span>
<h1 style="font-size:${size}px;margin-top:36px;max-width:940px">${esc(ch.title)}</h1>
<p class="sub" style="margin-top:22px;max-width:900px">${esc(ch.excerpt)}</p>
<div class="foot"><span style="display:flex;align-items:center;gap:18px"><span class="dots">${[1, 2, 3, 4, 5].map((i) => `<b class="${i <= ch.difficulty ? "on" : ""}"></b>`).join("")}</span>¿Puedes superarlo?</span>${lockup(44)}</div>`)]);
}

const iconPage = (size, pad, radius) => `<!doctype html><html><head><style>*{margin:0}body{width:${size}px;height:${size}px;background:${radius === null ? "#5B21E8" : "transparent"};display:grid;place-items:center}</style></head><body>
<svg width="${size - pad * 2}" height="${size - pad * 2}" viewBox="0 0 64 64">${radius === null ? "" : `<rect width="64" height="64" rx="${radius}" fill="#5B21E8"/>`}<circle cx="32" cy="32" r="18" fill="none" stroke="#fff" stroke-width="4"/><circle cx="32" cy="32" r="9" fill="none" stroke="#fff" stroke-width="4"/><circle cx="32" cy="32" r="3.6" fill="#FFC53D"/><path d="M32 6v8M32 50v8M6 32h8M50 32h8" stroke="#FFC53D" stroke-width="4" stroke-linecap="round"/></svg></body></html>`;

const { chromium, launchOpts } = await getChromium();
const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
for (const [name, html] of jobs) {
  await p.setContent(html, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(OG, name + ".png"), type: "png" });
}
for (const [name, size, pad, radius] of [["icon-32", 32, 0, 14], ["icon-192", 192, 0, 14], ["icon-512", 512, 0, 14], ["apple-touch-icon", 180, 0, null], ["maskable-512", 512, 64, null]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(iconPage(size, pad, radius));
  await p.screenshot({ path: path.join(ICONS, name + ".png"), omitBackground: radius !== null });
}
await browser.close();
fs.writeFileSync(path.join(STATIC, "favicon.svg"), brandMark(64).replace('class="brand-mark" width="64" height="64" ', 'xmlns="http://www.w3.org/2000/svg" ').replace(' aria-hidden="true" focusable="false"', ""));
console.log(`✓ ${jobs.length} imágenes sociales y 5 iconos generados`);
