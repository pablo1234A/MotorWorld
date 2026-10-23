/* Prueba el archivo único abriéndolo con file://, como un doble clic.
 *   STANDALONE=1 node build.mjs && node tests/standalone.mjs */
import assert from "node:assert/strict";
import path from "node:path";
import { ROOT } from "../scripts/load.mjs";
import { getChromium } from "../scripts/playwright.mjs";

const FILE = "file://" + path.join(ROOT, "standalone", "retame.html");
const { chromium, launchOpts } = await getChromium();
const browser = await chromium.launch(launchOpts);
let passed = 0, failed = 0;
async function test(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") p.errors.push(m.text()); });
  try { await fn(p); assert.deepEqual(p.errors, []); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.error("  ✗ " + name + "\n    " + (e.stack || e.message).split("\n").slice(0, 8).join("\n    ")); }
  await ctx.close();
}
function step(scope) {
  const root = document.querySelector(scope) || document;
  const vis = (el) => el && !el.hidden && el.getClientRects().length > 0;
  const q = (s) => [...root.querySelectorAll(s)].filter(vis);
  if (q("[data-result]").some((r) => r.innerHTML.trim())) return "result";
  const next = q("[data-next]")[0]; if (next) { next.click(); return "next"; }
  const memo = q(".memo-row")[0];
  if (memo) { window.__memo = memo.getAttribute("aria-label").replace("Secuencia: ", "").split(" "); return "wait"; }
  if (q("[data-your]")[0] && window.__memo) {
    const picked = q(".option.is-selected").length, b = q(".option:not(:disabled)").find((x) => x.dataset.v === window.__memo[picked]);
    if (b) { b.click(); return "mem"; }
  }
  const input = q(".text-input:not(:disabled)")[0];
  if (input) { input.value = "1"; root.querySelector("[data-check]").click(); return "text"; }
  const check = q("[data-check]")[0]; if (check) { check.click(); return "check"; }
  const opt = q(".option:not(:disabled)")[0]; if (opt) { opt.click(); return "opt"; }
  const items = q(".match-item:not(.is-done)");
  if (items.length) {
    const left = items.find((m) => m.dataset.side === "l"), rights = items.filter((m) => m.dataset.side === "r");
    window.__mi = (window.__mi || 0) + 1;
    left.click(); const r = rights[window.__mi % rights.length]; setTimeout(() => r.click(), 260);
    return "match";
  }
  return "idle";
}
async function playUntilResult(p, scope) {
  for (let i = 0; i < 400; i++) {
    const s = await p.evaluate(step, scope);
    if (s === "result") return;
    await p.waitForTimeout(s === "wait" ? 400 : s === "match" ? 560 : 270);
  }
  throw new Error("la partida no termina");
}

console.log("Archivo único (" + FILE + ")");
await test("abre la portada y navega por todas las secciones sin servidor", async (p) => {
  await p.goto(FILE);
  await p.waitForFunction(() => document.querySelector("[data-ticket-num]").textContent.length > 0);
  for (const [link, h1] of [["Retos", "Todos los retos"], ["Duelos", "Reta a tus amigos"], ["Mi progreso", "Mi progreso"], ["Reto del día", "Reto del día"]]) {
    await p.click(".nav-toggle");
    await p.click(`#main-nav a:has-text("${link}")`);
    await p.waitForFunction((t) => document.querySelector("main h1").textContent === t, h1, { timeout: 3000 });
    assert.equal(await p.getAttribute(`#main-nav a:has-text("${link}")`, "aria-current"), "page");
  }
  await p.goto(FILE + "#/retos/logica/");
  assert.match(await p.textContent("main h1"), /lógica/);
  await p.click('a:has-text("La balanza de las 9 monedas") >> nth=0');
  await p.waitForFunction(() => document.querySelector("main h1").textContent === "La balanza de las 9 monedas", null, { timeout: 3000 });
  assert.match(await p.title(), /balanza/);
  for (const u of ["#/privacidad/", "#/cookies/", "#/contacto/", "#/sobre-retame/", "#/como-funciona/", "#/juegos/"]) { await p.goto(FILE + u); assert.equal(await p.locator("main h1").count(), 1, u); }
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(over <= 0);
});
await test("reto del día completo, resultado guardado y visible al volver", async (p) => {
  await p.goto(FILE + "#/reto-del-dia/");
  await p.click("[data-go]");
  for (let r = 0; r < 6; r++) {
    if (await p.locator('.score span:has-text("de 1000")').count()) break;
    await playUntilResult(p, "[data-daily]");
    const n = p.locator("[data-next-round]");
    if (await n.count()) await n.click();
  }
  await p.waitForSelector('.score span:has-text("de 1000")');
  assert.equal(await p.textContent("[data-streak]"), "1");
  await p.reload();
  await p.waitForSelector('.score span:has-text("de 1000")');
  await p.goto(FILE + "#/");
  await p.waitForFunction(() => /Hecho/.test(document.querySelector("[data-ticket-title]").textContent));
});
await test("reto suelto, ancla a la solución y progreso", async (p) => {
  await p.goto(FILE + "#/retos/trivia/trivia-capitales-mundo/");
  await p.click("[data-start]");
  await playUntilResult(p, "[data-challenge]");
  await p.waitForSelector(".result .score");
  await p.click('.result a[href="#solucion"]');
  assert.equal(await p.evaluate(() => document.getElementById("solucion").open), true);
  assert.match(p.url(), /#\/retos\/trivia\/trivia-capitales-mundo\/$/);
  await p.goto(FILE + "#/progreso/");
  await p.waitForSelector("[data-progress] .tiles");
  assert.match(await p.textContent("[data-progress]"), /Capitales que casi todo el mundo confunde/);
});
await test("sesiones: categoría y Sorpréndeme", async (p) => {
  await p.goto(FILE + "#/juegos/");
  await p.click('.cat-grid a:has-text("Memoria")');
  await p.waitForSelector("[data-start-session]");
  await p.click("[data-start-session]");
  await playUntilResult(p, "[data-play]");
  await p.click("[data-next-reto]");
  await playUntilResult(p, "[data-play]");
  await p.goto(FILE + "#/juegos/?tema=sorpresa");
  await playUntilResult(p, "[data-play]");
});
await test("duelo por enlace dentro del archivo y enlaces antiguos", async (p) => {
  await p.goto(FILE + "#/retos/logica/balanza-nueve-monedas/?n=Ana&p=500&s=40");
  assert.match(await p.textContent(".banner"), /Ana te reta/);
  await p.goto(FILE + "#/juego/la-cerilla-primero");
  await p.waitForURL(/#\/retos\/logica\/la-cerilla-primero\/$/);
  assert.equal(await p.textContent("main h1"), "El acertijo de la cerilla y otras trampas");
  await p.goto(FILE + "#/duelo/g-numbers-0-normal-1a2b?n=Ana&p=400&s=20");
  await p.waitForURL(/#\/duelos\/\?r=g2-matematicas/);
  await p.waitForSelector(".banner");
  await p.goto(FILE + "#/esto-no-existe/");
  assert.match(await p.textContent("main h1"), /Aquí no hay ningún reto/);
});
await browser.close();
console.log(`${passed} tests del archivo único OK${failed ? `, ${failed} fallidos` : ""}`);
if (failed) process.exitCode = 1;
