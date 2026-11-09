import AxeBuilder from "@axe-core/playwright";
import { type Browser, type BrowserContext, devices, expect, type Page, test } from "@playwright/test";

import { db, grantPlan, uniqueEmail } from "./support/env";
import { createWorkshop, signUpAndVerify } from "./support/flows";

/**
 * Recorrido automático de la aplicación: parte del panel y de la web pública,
 * sigue los enlaces internos y, en cada pantalla, comprueba que no hay errores
 * de JavaScript ni en la consola, respuestas 5xx, enlaces rotos (404) ni
 * desbordamiento horizontal. Se hace como administrador (escritorio y móvil) y
 * como técnico con solo «ejecutar órdenes» (móvil). No envía formularios: solo
 * navega (GET), así que no crea ni borra nada.
 */

const MAX_PAGES = 250;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Rutas que no se visitan: cierran la sesión, cambian estado con GET o salen de la app. */
const SKIP = [/^\/auth\//, /^\/api\/app\/billing/, /^\/baja\//, /^\/invitacion\//, /^\/api\/v1\//, /^\/acceso/, /^\/registro/, /^\/recuperar/];

interface Problem {
  url: string;
  kind: string;
  detail: string;
}

/** Clave para no visitar cien fichas iguales: misma ruta con otro identificador = misma pantalla. */
function pattern(path: string): string {
  const [p, qs = ""] = path.split("?");
  const params = new URLSearchParams(qs);
  // Los parámetros que cambian de pantalla (pestañas de informes, plantillas de importación) cuentan con su valor; el resto, solo por nombre.
  const keys = [...new Set(params.keys())].sort().map((k) => (["lista", "tipo", "ver"].includes(k) ? `${k}=${params.get(k)}` : k));
  return p.replace(UUID, ":id").replace(/\/qr\/[^/]+/, "/qr/:token") + (keys.length ? `?${keys.join("&")}` : "");
}

async function crawl(page: Page, starts: string[], opts: { checkOverflow: boolean; a11y?: boolean }): Promise<{ problems: Problem[]; visited: string[] }> {
  const problems: Problem[] = [];
  const queue = [...starts];
  const seenPatterns = new Set<string>();
  const visited: string[] = [];
  let current = "";

  page.on("pageerror", (e) => problems.push({ url: current, kind: "pageerror", detail: e.message.slice(0, 300) }));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // El navegador registra como error de consola cualquier 4xx de un recurso; esos se comprueban aparte.
    if (/Failed to load resource/.test(text)) return;
    // La vista previa de los correos va en un iframe con sandbox="" (sin scripts, a propósito): si axe intenta
    // inyectarse en él, el navegador lo bloquea y lo anota. Es la protección funcionando, no un error de la app.
    if (/^Blocked script execution in 'about:srcdoc'/.test(text)) return;
    problems.push({ url: current, kind: "console", detail: text.slice(0, 300) });
  });
  page.on("response", (r) => {
    if (r.status() >= 500 && r.url().startsWith("http://localhost:3000")) problems.push({ url: current, kind: `http ${r.status()}`, detail: r.url() });
  });

  while (queue.length && visited.length < MAX_PAGES) {
    const path = queue.shift()!;
    const key = pattern(path.split("#")[0]);
    if (seenPatterns.has(key)) continue;
    seenPatterns.add(key);
    current = path;

    if (path.startsWith("/api/")) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      if (res.status() >= 400) problems.push({ url: path, kind: `api ${res.status()}`, detail: (await res.text()).slice(0, 200) });
      visited.push(path);
      continue;
    }

    const res = await page.goto(path, { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    visited.push(path);
    if (!res) continue;
    if (res.status() >= 400) problems.push({ url: path, kind: `status ${res.status()}`, detail: "" });
    // Con el renderizado en streaming, notFound() responde 200 con la pantalla 404.
    if (await page.getByRole("heading", { name: "Esta página no existe" }).isVisible().catch(() => false)) {
      problems.push({ url: path, kind: "404", detail: "pantalla «Esta página no existe»" });
    }
    if (await page.getByText(/Algo ha fallado|Ha ocurrido un error inesperado/).first().isVisible().catch(() => false)) {
      problems.push({ url: path, kind: "error boundary", detail: await page.locator("main").innerText().catch(() => "") });
    }
    if (opts.checkOverflow) {
      const overflow = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth <= w + 1) return null;
        // El culpable: el elemento visible más ancho que sobresale (las tablas van dentro de contenedores con scroll).
        let worst: { tag: string; cls: string; right: number } | null = null;
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.right <= w + 1) continue;
          let clipped = false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) {
              clipped = true;
              break;
            }
          }
          if (clipped) continue;
          if (!worst || r.right > worst.right) worst = { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), right: Math.round(r.right) };
        }
        return { scroll: document.documentElement.scrollWidth, width: w, worst };
      });
      if (overflow) problems.push({ url: path, kind: "overflow", detail: JSON.stringify(overflow) });
    }

    if (process.env.CRAWL_VERBOSE) console.log(`  · ${path} (${problems.length} problemas)`);
    if (opts.a11y && !path.includes("?")) {
      // Accesibilidad (WCAG 2.1 A/AA): solo las infracciones graves o críticas hacen fallar la prueba.
      // Las vistas previas de correo van en un iframe aislado (sandbox, sin scripts): axe no puede
      // inyectarse en él y se quedaría esperando. Se analiza la página sin ese iframe (es el correo, no el panel).
      await page.evaluate(() => document.querySelectorAll("iframe[sandbox]").forEach((f) => f.remove()));
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of axe.violations) {
        if (v.impact !== "serious" && v.impact !== "critical") continue;
        problems.push({ url: path, kind: `a11y ${v.id}`, detail: v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ") });
      }
    }

    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
    for (const h of hrefs) {
      if (!h.startsWith("/") || h.startsWith("//")) continue;
      if (SKIP.some((re) => re.test(h))) continue;
      if (!seenPatterns.has(pattern(h.split("#")[0]))) queue.push(h);
    }
  }
  return { problems, visited };
}

/** Datos de una empresa PCI completa: cliente, instalación, equipos, técnico, orden, incidencia y un vehículo antiguo. */
async function seed(owner: string, techEmail?: string) {
  const [ids] = await db<{ org: string; branch: string }>(
    `select m.organization_id as org, b.id as branch from organization_members m join profiles p on p.id = m.user_id
       join branches b on b.organization_id = m.organization_id and b.is_primary where p.email = $1`,
    [owner],
  );
  let memberId: string | null = null;
  if (techEmail) {
    [{ id: memberId }] = await db<{ id: string }>(
      `insert into organization_members (organization_id, user_id, role, permissions, branch_scope, status)
       select $1, p.id, 'operator', '{work_orders.execute,incidents.write}', 'all', 'active' from profiles p where p.email = $2 returning id`,
      [ids.org, techEmail],
    );
  }
  const [{ id: techId }] = await db<{ id: string }>("insert into technicians (organization_id, member_id, full_name) values ($1, $2, 'Pablo Ruiz') returning id", [ids.org, memberId]);
  const [{ id: customerId }] = await db<{ id: string }>(
    "insert into customers (organization_id, branch_id, first_name, customer_kind, legal_name, email) values ($1, $2, 'Comunidad Las Encinas', 'company', 'CP Las Encinas 12', 'encinas@cliente.test') returning id",
    [ids.org, ids.branch],
  );
  const [{ id: instId }] = await db<{ id: string }>(
    "insert into installations (organization_id, branch_id, customer_id, name, address_line1, city) values ($1, $2, $3, 'Garaje comunitario con un nombre bastante largo para probar el diseño', 'Calle Encina 12', 'Madrid') returning id",
    [ids.org, ids.branch, customerId],
  );
  const [{ id: eqId }] = await db<{ id: string }>(
    "insert into equipment (organization_id, branch_id, installation_id, category_code, code, location) values ($1, $2, $3, 'extinguisher', '', 'Planta -1, junto al ascensor') returning id",
    [ids.org, ids.branch, instId],
  );
  await db(
    `insert into equipment_extinguishers (equipment_id, organization_id, branch_id, agent, charge_value, charge_unit, put_in_service_on, stamped_on)
     values ($1, $2, $3, 'powder_abc', 6, 'kg', current_date - 350, current_date - 400)`,
    [eqId, ids.org, ids.branch],
  );
  await db("insert into equipment (organization_id, branch_id, installation_id, category_code, code, location, installed_on) values ($1, $2, $3, 'bie', '', 'Rampa', current_date - 300)", [ids.org, ids.branch, instId]);
  const [{ id: action }] = await db<{ id: string }>("select id from maintenance_action_types where code = 'ext_annual' and organization_id is null");
  const [{ id: orderId }] = await db<{ id: string }>(
    `insert into work_orders (organization_id, branch_id, customer_id, installation_id, service_type, status, scheduled_for, technician_id)
     values ($1, $2, $3, $4, 'periodic_maintenance', 'assigned', current_date, $5) returning id`,
    [ids.org, ids.branch, customerId, instId, techId],
  );
  await db("insert into work_order_items (organization_id, branch_id, work_order_id, equipment_id, planned_action_type_id) values ($1, $2, $3, $4, $5)", [ids.org, ids.branch, orderId, eqId, action]);
  await db("insert into equipment_incidents (organization_id, branch_id, installation_id, equipment_id, severity, title) values ($1, $2, $3, $4, 'high', 'Manómetro en rojo')", [ids.org, ids.branch, instId, eqId]);
  await db(
    `with c as (insert into customers (organization_id, branch_id, first_name, last_name) values ($1, $2, 'Cliente', 'Anterior') returning id)
     insert into vehicles (organization_id, branch_id, customer_id, plate) select $1, $2, id, '0001 AAA' from c`,
    [ids.org, ids.branch],
  );
  // Página pública de solicitud de visita activada.
  await db("update branch_settings set booking_enabled = true where branch_id = $1", [ids.branch]);
  const [{ slug }] = await db<{ slug: string }>("select slug::text as slug from organizations where id = $1", [ids.org]);
  return { orderId, slug };
}

function report(label: string, result: { problems: Problem[]; visited: string[] }) {
  console.log(`[${label}] ${result.visited.length} pantallas visitadas`);
  if (process.env.CRAWL_VERBOSE) for (const v of result.visited) console.log(`[${label}]   ${v}`);
  for (const p of result.problems) console.log(`[${label}] ${p.kind} · ${p.url} · ${p.detail}`);
}

async function mobileContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ ...devices["Pixel 7"], locale: "es-ES", timezoneId: "Europe/Madrid" });
}

test.describe("Recorrido de todas las pantallas", () => {
  test.setTimeout(1_200_000);

  test("administrador (escritorio y móvil) y técnico (móvil): sin errores, sin enlaces rotos, sin desbordamiento", async ({ page, browser }) => {
    const owner = uniqueEmail("recorrido");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Extintores Recorrido");
    await grantPlan(owner, "excelencia");

    const mobile = await mobileContext(browser);
    const tech = await mobile.newPage();
    const techEmail = uniqueEmail("recorrido-tecnico");
    await signUpAndVerify(tech, techEmail, { firstName: "Pablo" });
    const { slug } = await seed(owner, techEmail);

    const publicStarts = [`/t/${slug}/cita`, "/", "/ayuda", "/legal/aviso-legal", "/legal/privacidad", "/legal/terminos", "/legal/cookies", "/legal/encargo-tratamiento"];
    const desktop = await crawl(page, ["/app", ...publicStarts], { checkOverflow: true, a11y: true });
    report("admin escritorio", desktop);

    // Móvil del administrador: mismas cookies en un contexto con pantalla de teléfono.
    const adminMobile = await mobileContext(browser);
    await adminMobile.addCookies(await page.context().cookies());
    const adminPhone = await adminMobile.newPage();
    const phone = await crawl(adminPhone, ["/app", ...publicStarts], { checkOverflow: true, a11y: true });
    report("admin móvil", phone);

    const technician = await crawl(tech, ["/app"], { checkOverflow: true, a11y: true });
    report("técnico móvil", technician);

    await adminMobile.close();
    await mobile.close();

    // Identificadores mal formados o inexistentes: pantalla 404 (o 404 en descargas), nunca un error 500.
    const bad: Problem[] = [];
    const dashes = "-".repeat(36);
    const nil = "00000000-0000-0000-0000-000000000000";
    for (const id of [dashes, nil]) {
      for (const base of ["/app/clientes", "/app/instalaciones", "/app/equipos", "/app/ordenes-trabajo", "/app/incidencias", "/app/presupuestos", "/app/citas", "/app/vehiculos"]) {
        await page.goto(`${base}/${id}`);
        if (!(await page.getByRole("heading", { name: "Esta página no existe" }).isVisible())) bad.push({ url: `${base}/${id}`, kind: "no 404", detail: "" });
      }
      for (const api of [`/api/app/documents/${id}`, `/api/app/work-orders/${id}/pdf`, `/api/app/installations/${id}/report`, `/api/app/quotes/${id}/pdf`, `/api/app/customers/${id}/export`]) {
        const r = await page.request.get(api, { maxRedirects: 0 });
        if (r.status() !== 404) bad.push({ url: api, kind: `api ${r.status()}`, detail: "" });
      }
    }
    expect(bad).toEqual([]);

    expect(desktop.visited.length).toBeGreaterThan(30);
    expect([...desktop.problems, ...phone.problems, ...technician.problems]).toEqual([]);
  });
});
