/* End-to-end test of the full product in a real browser (Playwright/Chromium).
 *
 *   BASE_URL=http://localhost:3000 node scripts/e2e.cjs [outDir]
 *
 * Flow: register → generate from a brief → editor (select, edit, undo, AI chat, add section,
 * devices) → publish with review → published site runtime QA (console errors, mobile overflow,
 * broken internal links, form submission) → submissions visible in the editor → ZIP export.
 */
const { chromium } = require("playwright");
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = process.argv[2] || "test-results/e2e";
mkdirSync(OUT, { recursive: true });

let failures = 0;
async function step(page, name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`  ✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}: ${String(e.message).split("\n")[0]}`);
    await page.screenshot({ path: join(OUT, `fail-${name.replace(/\W+/g, "_")}.png`) }).catch(() => {});
  }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`editor: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`editor console: ${m.text().slice(0, 160)}`));
  const email = `e2e_${Date.now()}@example.com`;
  const preview = () => page.frameLocator('iframe[title^="Vista previa"]');
  let siteUrl = "";

  console.log(`World Builder AI e2e → ${BASE}`);
  await step(page, "register", async () => {
    await page.goto(`${BASE}/register`);
    await page.fill("input[name=name]", "E2E");
    await page.fill("input[name=email]", email);
    await page.fill("input[name=password]", "e2e-password-123");
    await page.click("button[type=submit]");
    await page.waitForURL("**/dashboard", { timeout: 30000 });
  });

  await step(page, "generate from brief", async () => {
    await page.fill("#brief", 'Tienda online de café de especialidad llamada "Tueste Norte" en Bilbao que vende granos, cafeteras y cursos de barista');
    await page.click('button[aria-label="Generar sitio"]');
    await page.waitForURL("**/editor/**", { timeout: 300000 });
    await page.waitForSelector('iframe[title^="Vista previa"]', { timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(OUT, "editor.png") });
  });

  await step(page, "select + edit + undo", async () => {
    await preview().locator('[data-wb-type="hero"]').first().click({ position: { x: 30, y: 30 } });
    await page.waitForSelector("text=Deseleccionar");
    const field = page.locator('aside[aria-label="Propiedades"] textarea').first();
    await field.fill("Café que se nota desde el primer sorbo.");
    await page.waitForTimeout(500);
    if (!(await preview().locator("h1").first().textContent()).includes("primer sorbo")) throw new Error("preview did not update");
    await page.click('button[aria-label="Deshacer"]');
    await page.waitForTimeout(400);
    if ((await preview().locator("h1").first().textContent()).includes("primer sorbo")) throw new Error("undo did not revert");
    await page.click('button[aria-label="Rehacer"]');
  });

  await step(page, "AI chat edit", async () => {
    await page.fill('textarea[aria-label="Instrucción para la IA"]', "Convierte esta sección en una experiencia premium con animaciones suaves, fondo oscuro y tipografía elegante");
    await page.keyboard.press("Enter");
    await page.waitForSelector("text=Cambios aplicados", { timeout: 300000 });
  });

  await step(page, "add section from library", async () => {
    await page.click('[role=tab]:has-text("Añadir")');
    await page.click('button:has-text("Preguntas frecuentes")');
    await page.click('[role=menuitem]:has-text("Acordeón")');
    await page.waitForTimeout(500);
    if (!(await preview().locator('[data-wb-type="faq"]').count())) throw new Error("faq not inserted");
  });

  await step(page, "devices", async () => {
    for (const d of ["Tablet", "Móvil", "Escritorio"]) {
      await page.click(`button[title="${d}"]`);
      await page.waitForTimeout(400);
    }
  });

  await step(page, "autosave", async () => {
    await page.waitForSelector('[role=status]:has-text("Guardado")', { timeout: 20000 });
  });

  await step(page, "publish with review", async () => {
    await page.click('button:has-text("Publicar")');
    await page.waitForSelector("text=Revisión previa");
    const ack = page.locator('button[role=switch][aria-label="Confirmo"]');
    if (await ack.count()) await ack.click();
    await page.click('button:has-text("Publicar sitio"), button:has-text("Publicar cambios")');
    await page.waitForSelector("text=Sitio publicado", { timeout: 30000 });
    siteUrl = await page.locator('a[href*="/s/"]').first().getAttribute("href");
    await page.keyboard.press("Escape");
  });

  // ── Runtime QA of the published site ──
  const site = await ctx.newPage();
  const siteErrors = [];
  site.on("pageerror", (e) => siteErrors.push(e.message));
  site.on("console", (m) => m.type() === "error" && siteErrors.push(m.text().slice(0, 160)));
  await step(site, "published site loads", async () => {
    const res = await site.goto(siteUrl, { waitUntil: "networkidle" });
    if (res.status() !== 200) throw new Error(`status ${res.status()}`);
    if ((await site.locator("h1").count()) !== 1) throw new Error("expected exactly one h1");
  });

  await step(site, "internal links resolve", async () => {
    const hrefs = await site.$$eval("a[href]", (as) => Array.from(new Set(as.map((a) => a.href).filter((h) => h.startsWith(location.origin)))));
    for (const h of hrefs) {
      const r = await site.request.get(h.split("#")[0]);
      if (r.status() >= 400) throw new Error(`${h} → ${r.status()}`);
    }
  });

  await step(site, "mobile layout has no horizontal overflow", async () => {
    const m = await ctx.newPage();
    await m.setViewportSize({ width: 375, height: 812 });
    for (const path of ["", "/tienda", "/contacto"]) {
      const r = await m.goto(siteUrl + path);
      if (r.status() !== 200) continue;
      const overflow = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (overflow > 1) throw new Error(`${path || "/"} overflows by ${overflow}px`);
    }
    await m.goto(siteUrl);
    await m.click("[data-wb-burger]");
    if (!(await m.locator(".wb-nav.is-open").count())) throw new Error("mobile menu does not open");
    await m.screenshot({ path: join(OUT, "site-mobile.png") });
    await m.close();
  });

  await step(site, "cart adds products", async () => {
    const add = site.locator("[data-wb-add]").first();
    if (!(await add.count())) return;
    await add.click();
    await site.waitForSelector("#wb-cart.is-open");
    await site.keyboard.press("Escape");
  });

  await step(site, "contact form submits", async () => {
    const form = site.locator("form[data-wb-form]").last();
    await form.scrollIntoViewIfNeeded();
    for (const input of await form.locator("input:not([type=hidden]):not([name=_gotcha]), textarea, select").all()) {
      const type = await input.getAttribute("type");
      const tag = await input.evaluate((el) => el.tagName);
      if (tag === "SELECT") await input.selectOption({ index: 1 });
      else if (type === "email") await input.fill("cliente@example.com");
      else if (type === "date") await input.fill("2026-12-15");
      else if (type === "tel") await input.fill("600123123");
      else if (type === "checkbox") await input.check();
      else await input.fill("Prueba end-to-end");
    }
    await form.locator("button[type=submit]").click();
    await site.waitForSelector(".wb-form-msg.is-ok", { timeout: 10000 });
  });
  await site.screenshot({ path: join(OUT, "site.png"), fullPage: false });

  await step(page, "submission visible in editor", async () => {
    await page.click('button[aria-label="Formularios"]');
    await page.waitForSelector("text=cliente@example.com", { timeout: 10000 });
    await page.keyboard.press("Escape");
  });

  await step(page, "ZIP export", async () => {
    const id = page.url().split("/editor/")[1];
    const r = await page.request.get(`${BASE}/api/projects/${id}/export`);
    if (r.status() !== 200 || !(r.headers()["content-type"] || "").includes("zip")) throw new Error(`export ${r.status()}`);
    if ((await r.body()).length < 5000) throw new Error("zip too small");
  });

  await step(page, "no console errors", async () => {
    const all = [...errors, ...siteErrors.map((e) => `site: ${e}`)];
    if (all.length) throw new Error(all.slice(0, 5).join(" | "));
  });

  await browser.close();
  console.log(failures ? `\n${failures} paso(s) fallidos` : "\nTodo correcto");
  process.exit(failures ? 1 : 0);
})();
