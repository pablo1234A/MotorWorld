/* Tests de extremo a extremo con Chromium sobre public/ (ejecuta antes
 * `npm run build`). Juegan de verdad: reto del día, retos, sesiones y
 * duelos entre dos navegadores.
 *   node tests/e2e.mjs */
import assert from "node:assert/strict";
import { serve } from "../scripts/serve.mjs";
import { getChromium } from "../scripts/playwright.mjs";
import { loadEngine } from "../scripts/load.mjs";

const E = loadEngine();
const server = await serve(0);
const BASE = "http://127.0.0.1:" + server.address().port;
const { chromium, launchOpts } = await getChromium();
const browser = await chromium.launch(launchOpts);
let passed = 0, failed = 0;

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: 860 }, hasTouch: !!opts.touch, permissions: ["clipboard-read", "clipboard-write"] });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });
  return page;
}
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.error("  ✗ " + name + "\n    " + (e.stack || e.message).split("\n").slice(0, 3).join("\n    ")); }
}

/* Jugador automático: da un paso en la zona de juego `scope`. Responde
 * la primera opción, escribe «1», repite bien la memoria y prueba
 * parejas hasta acertar. */
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
async function playUntilResult(page, scope) {
  for (let i = 0; i < 400; i++) {
    const s = await page.evaluate(step, scope);
    if (s === "result") return;
    await page.waitForTimeout(s === "wait" ? 400 : s === "match" ? 560 : 270);
  }
  const html = await page.evaluate((s) => (document.querySelector(s) || document.body).innerText.slice(0, 600), scope);
  throw new Error("la partida no termina:\n" + html);
}
async function playDaily(page) {
  await page.click("[data-daily] [data-go]");
  for (let r = 0; r < 6; r++) {
    if (await page.locator('[data-daily] .score span:has-text("de 1000")').count()) return;
    await playUntilResult(page, "[data-daily]");
    const nextRound = page.locator("[data-next-round]");
    if (await nextRound.count()) { await nextRound.click(); await page.waitForTimeout(150); } else return;
  }
}

console.log("E2E en " + BASE);
const today = E.dayInTz(), set = E.dailySet(today);

await test("portada: carga sin errores, una acción principal y reto del día del día", async () => {
  const p = await newPage();
  await p.goto(BASE + "/");
  assert.equal(await p.locator("h1").count(), 1);
  assert.equal(await p.locator(".hero .btn-primary").getAttribute("href"), "/reto-del-dia/");
  await p.waitForFunction(() => document.querySelector("[data-ticket-num]").textContent.length > 0);
  assert.equal(await p.textContent("[data-ticket-num]"), "#" + set.number);
  assert.equal(await p.locator(".ticket .round").count(), set.rounds.length);
  assert.match(await p.textContent("[data-countdown]"), /^\d\d:\d\d:\d\d$/);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

await test("responsive: sin scroll horizontal de 320 a 1920 px", async () => {
  const urls = ["/", "/reto-del-dia/", "/juegos/", "/juegos/?tema=logica", "/retos/", "/retos/trivia/", "/retos/palabras/duelo-de-parejas-rapidas/", "/duelos/", "/progreso/", "/privacidad/", "/no-existe/"];
  for (const width of [320, 375, 390, 430, 768, 1366, 1440, 1920]) {
    const p = await newPage({ width });
    for (const u of urls) {
      await p.goto(BASE + u);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 0, `${u} a ${width}px desborda ${over}px`);
    }
    assert.deepEqual(p.errors.filter((e) => !/404/.test(e)), [], "errores a " + width);
    await p.context().close();
  }
});

await test("botones táctiles de al menos 44 px en móvil", async () => {
  const p = await newPage({ width: 375, touch: true });
  await p.goto(BASE + "/retos/logica/balanza-nueve-monedas/");
  await p.click("[data-start]");
  await p.waitForSelector(".option");
  const small = await p.evaluate(() => [...document.querySelectorAll(".btn, .option, .nav-toggle")].filter((b) => b.getClientRects().length && b.getBoundingClientRect().height < 40).map((b) => b.className));
  assert.deepEqual(small, []);
  await p.context().close();
});

await test("reto del día: se juega entero, puntúa sobre 1000, guarda racha y no cambia al recargar", async () => {
  const p = await newPage();
  await p.goto(BASE + "/reto-del-dia/");
  const before = await p.locator("[data-daily] .round span").allTextContents();
  await p.reload();
  assert.deepEqual(await p.locator("[data-daily] .round span").allTextContents(), before, "recargar no cambia el reto");
  assert.deepEqual(before, Array.from(set.rounds, (r) => E.catBySlug[r.ch.cat].label));
  await playDaily(p);
  await p.waitForSelector(".result .score");
  assert.match(await p.textContent(".result .score span"), /de 1000/);
  assert.equal(await p.locator(".result .squares li").count(), set.rounds.length);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem("retame:v2")));
  const rec = st.daily[today];
  assert.equal(rec.v, 2); assert.ok(rec.points >= 0 && rec.points <= 1000);
  assert.equal(st.streak.current, 1); assert.equal(st.dailyRun, null);
  assert.equal(await p.textContent("[data-streak]"), "1");
  /* Acción principal y secundaria del resultado. */
  assert.match(await p.textContent(".result .actions .btn-primary"), /Jugar otro reto/);
  assert.match(await p.textContent(".result .actions .btn-outline"), /Retar a un amigo/);
  /* Compartir: cuadros y puntos, sin respuestas. */
  await p.click("[data-share]");
  const shared = await p.evaluate(() => navigator.clipboard.readText());
  assert.match(shared, new RegExp("^RÉTAME #" + set.number));
  assert.match(shared, /[🟩🟨🟥]{4,5}/u);
  assert.match(shared, /\/1000/);
  for (const r of set.rounds) for (const q of r.ch.data.preguntas || []) if (q.opciones) assert.ok(!shared.includes(q.opciones[q.correcta]) || /^\d+$/.test(q.opciones[q.correcta]), "el resultado revela una respuesta");
  /* Recargar: muestra el resultado, no un reto nuevo. */
  await p.reload();
  await p.waitForSelector(".result .score");
  await p.waitForFunction((t) => document.querySelector(".result .score b").textContent === t, String(E.fmt(rec.points)), { timeout: 3000 });
  await p.goto(BASE + "/");
  await p.waitForFunction(() => /Hecho/.test(document.querySelector("[data-ticket-title]").textContent));
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

await test("reto del día: si sales a mitad, continúas por donde ibas", async () => {
  const p = await newPage();
  await p.goto(BASE + "/reto-del-dia/");
  await p.click("[data-go]");
  await playUntilResult(p, "[data-daily]");
  await p.reload();
  assert.match(await p.textContent("[data-go]"), /Continuar: prueba 2/);
  await p.context().close();
});

await test("reto del día: mañana es otro (reloj simulado)", async () => {
  const p = await newPage();
  const tomorrow = E.addDay(today, 1);
  await p.clock.install({ time: new Date(tomorrow + "T12:00:00+02:00") });
  await p.goto(BASE + "/");
  await p.waitForFunction(() => document.querySelector("[data-ticket-num]").textContent.length > 0);
  assert.equal(await p.textContent("[data-ticket-num]"), "#" + (set.number + 1));
  const labels = await p.locator(".ticket .round span").allTextContents();
  assert.deepEqual(labels, Array.from(E.dailySet(tomorrow).rounds, (r) => E.catBySlug[r.ch.cat].label));
  await p.context().close();
});

let duelLink = "";
await test("duelo del reto del día: crear enlace, abrirlo en otro navegador, jugar y comparar", async () => {
  const a = await newPage();
  await a.goto(BASE + "/reto-del-dia/");
  await playDaily(a);
  await a.click("[data-duel]");
  await a.fill("#duel-nick", "Ana");
  await a.click("[data-copy]");
  const msg = await a.evaluate(() => navigator.clipboard.readText());
  duelLink = (msg.match(/https?:\/\/\S+/) || [])[0];
  assert.ok(duelLink && /\/reto-del-dia\/\?d=\d{4}-\d{2}-\d{2}&n=Ana&p=\d+&s=\d+&g=[vx~]+/.test(duelLink), duelLink);
  const wa = await a.getAttribute('[data-ch="whatsapp"]', "href");
  assert.ok(wa.startsWith("https://wa.me/?text="), "WhatsApp");
  assert.ok((await a.getAttribute('[data-ch="telegram"]', "href")).startsWith("https://t.me/share/url?url="), "Telegram");
  const ach = await a.evaluate(() => JSON.parse(localStorage.getItem("retame:v2")).ach);
  assert.ok(ach.retador, "logro de retador");
  const b = await newPage();
  await b.goto(duelLink);
  assert.match(await b.textContent(".banner"), /Ana te reta/);
  await playDaily(b);
  await b.waitForSelector(".versus");
  assert.match(await b.textContent(".verdict"), /Ganas tú|gana esta vez|Empate/);
  assert.match(await b.textContent(".result .btn-outline"), /Retar de vuelta/);
  assert.deepEqual(a.errors.concat(b.errors), []);
  await a.context().close(); await b.context().close();
});

await test("reto con página propia: jugar, resultado y duelo con la misma secuencia de memoria", async () => {
  const a = await newPage();
  await a.goto(BASE + "/retos/memoria/secuencia-colores/");
  await a.click("[data-start]");
  await a.waitForSelector(".memo-row");
  const seqA = await a.getAttribute(".memo-row", "aria-label");
  await playUntilResult(a, "[data-challenge]");
  await a.waitForSelector(".result .score");
  await a.click("[data-duel]");
  await a.click("[data-copy]");
  const link = ((await a.evaluate(() => navigator.clipboard.readText())).match(/https?:\/\/\S+/) || [])[0];
  assert.match(link, /\/retos\/memoria\/secuencia-colores\/\?n=Alguien&p=\d+&s=\d+&k=[0-9a-z]+/);
  const b = await newPage();
  await b.goto(link);
  await b.waitForSelector(".banner");
  await b.click("[data-start]");
  await b.waitForSelector(".memo-row");
  assert.equal(await b.getAttribute(".memo-row", "aria-label"), seqA, "el amigo recibe la misma secuencia");
  await playUntilResult(b, "[data-challenge]");
  await b.waitForSelector(".versus");
  await a.context().close(); await b.context().close();
});

await test("duelo manipulado: no rompe la página", async () => {
  const p = await newPage();
  for (const u of ["/retos/logica/balanza-nueve-monedas/?n=<b>x</b>&p=99999999&s=-4", "/reto-del-dia/?d=2999-01-01&n=A&p=abc", "/duelos/?r=g2-logica-nope-normal-zz&n=A&p=1&s=1", "/juegos/?reto=%3Cscript%3E", "/juegos/?tema=inventada", "/reto-del-dia/?d=1900-01-01&n=A&p=500&s=20&g=vvvvvvvvvvvvvvv"]) {
    await p.goto(BASE + u);
    await p.waitForTimeout(150);
    assert.equal(await p.locator("b:text('x')").count(), 0, "no se inyecta HTML");
  }
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

await test("sesión de 10 retos de una categoría", async () => {
  const p = await newPage({ width: 1366 });
  await p.goto(BASE + "/juegos/?tema=logica");
  await p.click('[data-mode="normal"]');
  await p.click("[data-start-session]");
  for (let r = 0; r < 10; r++) {
    await playUntilResult(p, "[data-play]");
    await p.click("[data-next-reto]");
    await p.waitForTimeout(120);
  }
  await p.waitForSelector("[data-again-session]");
  assert.match(await p.textContent(".result .eyebrow"), /Sesión completada/);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem("retame:v2")));
  assert.equal(st.games, 10); assert.ok(st.ach.sesion);
  assert.ok(st.catStats.logica.g >= 10);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

await test("Sorpréndeme y modo en grupo (sin puntos)", async () => {
  const p = await newPage();
  await p.goto(BASE + "/juegos/?tema=sorpresa");
  await playUntilResult(p, "[data-play]");
  await p.goto(BASE + "/juegos/?tema=grupo");
  await playUntilResult(p, "[data-play]");
  assert.match(await p.textContent("[data-play] .result-title"), /Anotado/);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem("retame:v2")));
  assert.equal(st.history[0].points, 0);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

await test("migración desde la versión 1 sin perder el progreso", async () => {
  const yesterday = E.addDay(today, -1);
  const v1 = { history: [{ slug: "balanza-nueve-monedas", title: "La balanza", cat: "mind", points: 900, accuracy: 100, seconds: 50, at: Date.now() }], best: { "balanza-nueve-monedas": { points: 900, seconds: 50, accuracy: 100 } }, streak: { current: 5, best: 9, total_days: 20, last_day: yesterday }, ach: { primer_reto: 1, racha_3: 1 }, daily: {}, nick: "Pablo", duels: 2, points: 5000, games: 20, seenByCat: { mind: ["a"], hard: ["b"] }, recent: [], recentSigs: [], famCount: {}, days: {}, catStats: { mind: { g: 5, acc: 400, n: 5 }, hard: { g: 3, acc: 240, n: 3 }, geo: { g: 2, acc: 100, n: 2 } }, accSum: 900, accN: 10, logicWins: 4, sessions: 1, bestSession: 3000 };
  const p = await newPage({ init: `if (!sessionStorage.getItem("seeded")) { localStorage.setItem("retame:v1", ${JSON.stringify(JSON.stringify(v1))}); sessionStorage.setItem("seeded", "1"); }` });
  await p.goto(BASE + "/progreso/");
  await p.waitForSelector("[data-progress] .tiles");
  assert.equal(await p.textContent("[data-streak]"), "5");
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem("retame:v2")));
  assert.equal(st.catStats.logica.g, 8); assert.equal(st.catStats.trivia.g, 2);
  assert.equal(st.nick, "Pablo"); assert.equal(st.streak.best, 9); assert.ok(st.ach.racha_3);
  assert.ok(await p.evaluate(() => !!localStorage.getItem("retame:v1")), "no borra la versión 1");
  assert.match(await p.textContent("[data-progress]"), /versión anterior/);
  /* Borrar progreso */
  await p.click("[data-reset]");
  await p.click("[data-yes]");
  assert.deepEqual(await p.evaluate(() => [localStorage.getItem("retame:v2"), localStorage.getItem("retame:v1")]), [null, null]);
  assert.equal(await p.textContent("[data-streak]"), "0");
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

await test("localStorage corrupto o sin almacenamiento: la web sigue funcionando", async () => {
  const p = await newPage({ init: `localStorage.setItem("retame:v2", "{roto");` });
  await p.goto(BASE + "/");
  await p.waitForFunction(() => document.querySelector("[data-ticket-num]").textContent.length > 0);
  assert.equal(await p.evaluate(() => localStorage.getItem("retame:v2:corrupto")), "{roto");
  assert.deepEqual(p.errors, []);
  await p.context().close();
  const q = await newPage({ init: `Object.defineProperty(window, "localStorage", { get() { throw new Error("bloqueado"); } });` });
  await q.goto(BASE + "/retos/trivia/trivia-capitales-mundo/");
  await q.click("[data-start]");
  await playUntilResult(q, "[data-challenge]");
  await q.waitForSelector(".result .score");
  await q.context().close();
});

await test("enlaces antiguos (#/…) redirigen a las URLs nuevas", async () => {
  const p = await newPage();
  const cases = [
    ["/#/juego/balanza-nueve-monedas", "/retos/logica/balanza-nueve-monedas/"],
    ["/#/duelo/balanza-nueve-monedas?n=Ana&p=500&s=30", "/retos/logica/balanza-nueve-monedas/?n=Ana&p=500&s=30"],
    ["/#/legal/privacidad", "/privacidad/"], ["/#/catalogo/geo", "/retos/trivia/"], ["/#/acertijos", "/retos/logica/"],
    ["/#/sorprendeme", "/juegos/?tema=sorpresa"], ["/#/reta-a-tus-amigos", "/duelos/"], ["/#/progreso", "/progreso/"]
  ];
  for (const [from, to] of cases) {
    await p.goto(BASE + from);
    await p.waitForURL((u) => !u.hash, { timeout: 3000 });
    assert.equal(p.url().replace(BASE, ""), to, from);
  }
  await p.goto(BASE + "/#/duelo/g-numbers-0-normal-1a2b?n=Ana&p=400&s=20");
  await p.waitForURL(/\/duelos\/\?r=g2-matematicas-arit-normal-/);
  await p.waitForSelector(".banner");
  assert.match(await p.textContent(".banner"), /Ana te reta/);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

await test("404 real y útil", async () => {
  const p = await newPage();
  const r = await p.goto(BASE + "/retos/logica/no-existe/");
  assert.equal(r.status(), 404);
  for (const t of ["Volver a RÉTAME", "Jugar el reto de hoy", "Explorar retos"]) assert.equal(await p.locator(`a:has-text("${t}")`).count(), 1, t);
  await p.context().close();
});

await test("accesibilidad básica: teclado, foco y reducción de movimiento", async () => {
  const p = await newPage({ width: 1366 });
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.goto(BASE + "/retos/trivia/trivia-capitales-mundo/");
  await p.keyboard.press("Tab");
  assert.equal(await p.evaluate(() => document.activeElement.className), "skip-link");
  await p.focus("[data-start]"); await p.keyboard.press("Enter");
  await p.waitForSelector(".option");
  await p.waitForTimeout(260);
  await p.keyboard.press("2");
  await p.waitForSelector(".option.is-ok");
  assert.equal(await p.evaluate(() => document.activeElement.hasAttribute("data-next")), true, "el foco pasa a «Siguiente»");
  const dur = await p.evaluate(() => getComputedStyle(document.querySelector(".option.is-ok")).animationName);
  assert.equal(dur, "none");
  const unlabeled = await p.evaluate(() => [...document.querySelectorAll("button, a")].filter((b) => b.getClientRects().length && !(b.textContent.trim() || b.getAttribute("aria-label"))).length);
  assert.equal(unlabeled, 0, "botones sin nombre accesible");
  await p.context().close();
});

await browser.close();
server.close();
console.log(`${passed} tests E2E OK${failed ? `, ${failed} fallidos` : ""}`);
if (failed) process.exitCode = 1;
