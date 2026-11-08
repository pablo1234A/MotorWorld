import { devices, expect, type Page, test } from "@playwright/test";

import { db, grantPlan, uniqueEmail } from "./support/env";
import { createWorkshop, signUpAndVerify } from "./support/flows";

/** Tarjeta (<section>) del panel identificada por su título. */
const section = (page: Page, title: string | RegExp) => page.locator("section", { has: page.getByRole("heading", { name: title }) });

/** Fecha ISO desplazada desde hoy (zona de Madrid no afecta a días enteros en estas pruebas). */
function isoFromToday(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const es = (iso: string) => iso.split("-").reverse().join("/");

test.describe("PCI: de un cliente nuevo a una orden de trabajo finalizada", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", (d) => d.accept());
  });

  test("cliente → instalación → extintor → técnico → orden → resultado → finalizar → historial, incidencia, calendario e informes", async ({ page }) => {
    const owner = uniqueEmail("pci");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Extintores Norte");
    await grantPlan(owner, "max");

    // 1. Cliente (empresa)
    await page.getByRole("link", { name: "Clientes", exact: true }).filter({ visible: true }).first().click();
    await page.getByRole("link", { name: "Nuevo cliente" }).filter({ visible: true }).click();
    await page.getByLabel("Empresa, comunidad u organismo", { exact: true }).filter({ visible: true }).check();
    await page.getByLabel("Nombre comercial", { exact: true }).filter({ visible: true }).fill("Comunidad Las Encinas");
    await page.getByLabel("Razón social", { exact: true }).filter({ visible: true }).fill("Comunidad de Propietarios Las Encinas 12");
    await page.getByLabel("Persona de contacto", { exact: true }).filter({ visible: true }).fill("Marta Gil");
    await page.getByLabel("Correo electrónico", { exact: true }).filter({ visible: true }).fill("encinas@correo.test");
    await page.getByRole("button", { name: "Crear cliente" }).filter({ visible: true }).click();
    await expect(page.getByText("Cliente creado.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Comunidad Las Encinas" })).toBeVisible();

    // 2. Instalación
    await page.getByRole("link", { name: "Nueva instalación" }).filter({ visible: true }).click();
    await page.getByLabel("Nombre de la instalación", { exact: true }).filter({ visible: true }).fill("Garaje comunitario");
    await page.getByLabel("Tipo de establecimiento", { exact: true }).filter({ visible: true }).selectOption({ label: "Aparcamiento" });
    await page.getByLabel("Dirección", { exact: true }).filter({ visible: true }).fill("Calle Encina 12");
    await page.getByLabel("Código postal", { exact: true }).filter({ visible: true }).fill("28001");
    await page.getByLabel("Municipio", { exact: true }).filter({ visible: true }).fill("Madrid");
    await page.getByRole("button", { name: "Crear instalación" }).filter({ visible: true }).click();
    await expect(page.getByText("Instalación creada.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Garaje comunitario" })).toBeVisible();

    // 3. Extintor: puesto en servicio hace casi un año → la revisión anual vence en los próximos 30 días.
    const putInService = isoFromToday(-350);
    const annualDue = isoFromToday(-350 + 365); // aproximado: se comprueba que aparece como próximo
    void annualDue;
    await page.getByRole("link", { name: "Añadir equipo" }).filter({ visible: true }).click();
    await page.getByLabel("Agente extintor", { exact: true }).filter({ visible: true }).selectOption({ label: "Polvo ABC" });
    await page.getByLabel("Capacidad", { exact: true }).filter({ visible: true }).fill("6");
    await page.getByLabel("Eficacia", { exact: true }).filter({ visible: true }).fill("27A-183B-C");
    await page.getByLabel("Ubicación", { exact: true }).filter({ visible: true }).fill("Planta -1, junto al ascensor");
    await page.getByLabel("Fecha de timbrado", { exact: true }).filter({ visible: true }).fill(isoFromToday(-400));
    await page.getByLabel("Puesta en servicio", { exact: true }).filter({ visible: true }).fill(putInService);
    await page.getByRole("button", { name: "Crear equipo", exact: true }).filter({ visible: true }).click();
    await expect(page.getByText("Equipo dado de alta.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "EXT-000001" })).toBeVisible();
    const programa = section(page, "Mantenimiento programado");
    await expect(programa.getByText("Mantenimiento anual (UNE 23120)")).toBeVisible();
    await expect(programa.getByText("Retimbrado (prueba de nivel C)")).toBeVisible();
    await expect(page.getByText("Vida útil por retimbrados (derivada)")).toBeVisible();
    const equipmentUrl = page.url();

    // 4. Técnico
    await page.goto("/app/configuracion/tecnicos");
    const nuevo = section(page, "Añadir técnico");
    await nuevo.getByLabel("Nombre y apellidos", { exact: true }).filter({ visible: true }).fill("Pablo Ruiz");
    await nuevo.getByLabel("Teléfono", { exact: true }).filter({ visible: true }).fill("611 222 333");
    await nuevo.getByRole("button", { name: "Añadir técnico" }).click();
    await expect(page.getByRole("heading", { name: "Pablo Ruiz" })).toBeVisible();

    // 5. Orden de trabajo desde la instalación, con lo que vence en 30 días ya marcado
    await page.goto("/app/instalaciones");
    await page.getByRole("link", { name: "Garaje comunitario" }).filter({ visible: true }).click();
    await page.getByRole("link", { name: "Nueva orden de trabajo" }).filter({ visible: true }).click();
    await expect(page.getByRole("checkbox", { name: /EXT-000001: Mantenimiento anual/ })).toBeChecked();
    await page.getByLabel("Técnico asignado", { exact: true }).filter({ visible: true }).selectOption({ label: "Pablo Ruiz" });
    await page.getByLabel("Fecha programada", { exact: true }).filter({ visible: true }).fill(isoFromToday(1));
    await page.getByLabel("Hora", { exact: true }).filter({ visible: true }).fill("09:30");
    await page.getByRole("button", { name: "Crear orden de trabajo" }).filter({ visible: true }).click();
    await expect(page.getByText("Orden creada y asignada a Pablo Ruiz.")).toBeVisible();
    const number = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
    expect(number).toMatch(/^OT-\d{4}-\d{4}$/);
    await expect(page.getByText("Asignada").first()).toBeVisible();

    // 6. Ejecutar: empezar, registrar resultado (con material y una incidencia), finalizar
    await page.getByRole("button", { name: "Empezar el trabajo" }).filter({ visible: true }).click();
    await expect(page.getByText("Estado: En curso.")).toBeVisible();
    const form = page.getByRole("form", { name: /Resultado de EXT-000001/ });
    await form.getByLabel("Resultado", { exact: true }).filter({ visible: true }).selectOption({ label: "Correcto con observaciones" });
    await form.getByLabel("Observaciones", { exact: true }).filter({ visible: true }).fill("Presión correcta. Se cambia el precinto.");
    await form.getByLabel("Material 1", { exact: true }).filter({ visible: true }).fill("Precinto de seguridad");
    await form.getByRole("button", { name: "Guardar resultado" }).click();
    await expect(page.getByText("Resultado guardado en el historial del equipo.")).toBeVisible();
    await expect(page.getByText("1/1 equipos con resultado")).toBeVisible();
    await page.getByLabel("Notas de cierre", { exact: true }).filter({ visible: true }).fill("Revisión anual realizada sin incidencias graves.");
    await page.getByRole("button", { name: "Finalizar la orden" }).filter({ visible: true }).click();
    await expect(page.getByText("Estado: Completada.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Empezar el trabajo" })).toHaveCount(0);

    // 7. Historial del equipo: la actuación con su orden; la próxima anual pasa a dentro de un año
    await page.goto(equipmentUrl);
    const historial = section(page, /Historial de actuaciones/);
    await expect(historial.getByText("Mantenimiento anual (UNE 23120)").first()).toBeVisible();
    await expect(historial.getByRole("link", { name: number })).toBeVisible();
    await expect(historial.getByText("Precinto de seguridad", { exact: false })).toBeVisible();
    const nextYear = isoFromToday(365);
    await expect(section(page, "Mantenimiento programado").getByText(es(nextYear), { exact: false })).toBeVisible();

    // 8. Mantenimientos (historial general)
    await page.goto("/app/mantenimientos");
    await expect(page.getByRole("link", { name: "EXT-000001" }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator("table").getByText("Correcto con observaciones").first()).toBeVisible();

    // 9. Incidencia sobre el equipo
    await page.goto(equipmentUrl);
    await page.getByRole("link", { name: "Incidencia", exact: true }).filter({ visible: true }).click();
    await page.getByLabel("Incidencia", { exact: true }).filter({ visible: true }).fill("Señalización del extintor despegada");
    await page.getByLabel("Gravedad", { exact: true }).filter({ visible: true }).selectOption({ label: "Baja" });
    await page.getByRole("button", { name: "Registrar incidencia" }).filter({ visible: true }).click();
    await expect(page.getByText("Incidencia registrada.")).toBeVisible();
    await page.getByLabel("Estado", { exact: true }).filter({ visible: true }).selectOption({ label: "Resuelta" });
    await page.getByLabel("Resolución", { exact: true }).filter({ visible: true }).fill("Se coloca una señal nueva.");
    await page.getByRole("button", { name: "Guardar" }).filter({ visible: true }).click();
    await expect(page.getByText("Cambios guardados.")).toBeVisible();

    // 10. Calendario: la orden (finalizada) en su día
    await page.goto(`/app/calendario?mes=${isoFromToday(1).slice(0, 7)}`);
    await expect(page.getByRole("link", { name: new RegExp(number) }).filter({ visible: true }).first()).toBeAttached();

    // 11. Informes PCI (plan Max)
    await page.goto("/app/informes?lista=mantenimientos");
    await expect(page.getByRole("heading", { name: "Mantenimiento de equipos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "EXT-000001" }).filter({ visible: true }).first()).toBeVisible();
    const csv = await page.request.get("/api/app/reports/mantenimientos");
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain("EXT-000001");

    // Trazabilidad en la BD: actuación ligada a la orden y orden cerrada
    const [row] = await db<{ status: string; n: string }>(
      `select w.status, (select count(*) from equipment_maintenance_records m where m.work_order_id = w.id) as n
         from work_orders w
        where w.number = $1
          and w.organization_id = (select m.organization_id from organization_members m join auth.users u on u.id = m.user_id where u.email = $2)`,
      [number, owner],
    );
    expect(row.status).toBe("completed");
    expect(Number(row.n)).toBe(1);
  });

  test("etiqueta QR: sin sesión pide entrar; con sesión abre la ficha del equipo", async ({ page, browser }) => {
    const owner = uniqueEmail("qr");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "PCI Levante");
    await grantPlan(owner, "pro");
    await page.goto("/app/clientes/nuevo");
    await page.getByLabel("Nombre comercial", { exact: true }).filter({ visible: true }).fill("Hotel Mar");
    await page.getByRole("button", { name: "Crear cliente" }).filter({ visible: true }).click();
    await page.getByRole("link", { name: "Nueva instalación" }).filter({ visible: true }).click();
    await page.getByLabel("Nombre de la instalación", { exact: true }).filter({ visible: true }).fill("Hotel Mar · edificio");
    await page.getByLabel("Dirección", { exact: true }).filter({ visible: true }).fill("Paseo Marítimo 1");
    await page.getByRole("button", { name: "Crear instalación" }).filter({ visible: true }).click();
    await page.getByRole("link", { name: "Añadir equipo" }).filter({ visible: true }).click();
    await page.getByLabel("Categoría", { exact: true }).filter({ visible: true }).selectOption({ label: "Bocas de incendio equipadas (BIE)" });
    await page.getByLabel("Ubicación", { exact: true }).filter({ visible: true }).fill("Recepción");
    await page.getByRole("button", { name: "Crear equipo", exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole("heading", { name: "BIE-000001" })).toBeVisible();

    const [eq] = await db<{ qr_token: string }>(`select qr_token from equipment where code = 'BIE-000001' and location = 'Recepción' order by created_at desc limit 1`);
    // Sin sesión: va al acceso (no revela nada del equipo)
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`/app/equipos/qr/${eq.qr_token}`);
    await expect(anonPage).toHaveURL(/\/acceso/);
    await expect(anonPage.getByText("Recepción")).toHaveCount(0);
    await anon.close();
    // Con sesión: abre la ficha
    await page.goto(`/app/equipos/qr/${eq.qr_token}`);
    await expect(page.getByRole("heading", { name: "BIE-000001" })).toBeVisible();
    // Etiquetas imprimibles
    await page.goto(page.url().replace(/\/app\/equipos\/.*/, "/app/instalaciones"));
    await page.getByRole("link", { name: "Hotel Mar · edificio" }).filter({ visible: true }).click();
    await page.getByRole("link", { name: "Etiquetas QR" }).filter({ visible: true }).click();
    await expect(page.getByText("BIE-000001")).toBeVisible();
    await expect(page.locator("li svg").first()).toBeVisible();
  });

  test("técnico en el móvil: solo ve sus órdenes, empieza, registra el resultado con foto y la finaliza", async ({ page, browser }) => {
    const owner = uniqueEmail("pci-jefe");
    const techEmail = uniqueEmail("pci-tecnico");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Extintores Sur");
    await grantPlan(owner, "business");

    // El técnico tiene su cuenta y entra en la empresa como «Técnico / operario» (solo ejecutar órdenes e incidencias).
    const mobile = await browser.newContext({ ...devices["Pixel 7"] });
    const tech = await mobile.newPage();
    await signUpAndVerify(tech, techEmail, { firstName: "Pablo" });
    const [ids] = await db<{ org: string; branch: string; member: string }>(
      `with o as (select m.organization_id as org, b.id as branch from organization_members m join profiles p on p.id = m.user_id
                    join branches b on b.organization_id = m.organization_id and b.is_primary where p.email = $1),
            m as (insert into organization_members (organization_id, user_id, role, permissions, branch_scope, status)
                  select o.org, p.id, 'operator', '{work_orders.execute,incidents.write}', 'all', 'active' from o, profiles p where p.email = $2 returning id)
       select o.org, o.branch, m.id as member from o, m`,
      [owner, techEmail],
    );
    const [{ id: techId }] = await db<{ id: string }>("insert into technicians (organization_id, member_id, full_name) values ($1, $2, 'Pablo Martín') returning id", [ids.org, ids.member]);
    const [{ id: otherTech }] = await db<{ id: string }>("insert into technicians (organization_id, full_name) values ($1, 'Otra Persona') returning id", [ids.org]);
    const [{ id: customerId }] = await db<{ id: string }>("insert into customers (organization_id, branch_id, first_name, customer_kind) values ($1, $2, 'Hotel Mar', 'company') returning id", [ids.org, ids.branch]);
    const [{ id: instId }] = await db<{ id: string }>(
      "insert into installations (organization_id, branch_id, customer_id, name, address_line1, city) values ($1, $2, $3, 'Hotel Mar · edificio', 'Paseo Marítimo 1', 'Cádiz') returning id",
      [ids.org, ids.branch, customerId],
    );
    const [{ id: eqId }] = await db<{ id: string }>(
      "insert into equipment (organization_id, branch_id, installation_id, category_code, code, location, installed_on) values ($1, $2, $3, 'bie', '', 'Recepción', current_date - 300) returning id",
      [ids.org, ids.branch, instId],
    );
    const [{ id: action }] = await db<{ id: string }>("select id from maintenance_action_types where code = 'bie_annual' and organization_id is null");
    const order = async (technician: string) => {
      const [{ id }] = await db<{ id: string }>(
        `insert into work_orders (organization_id, branch_id, customer_id, installation_id, service_type, status, scheduled_for, technician_id)
         values ($1, $2, $3, $4, 'periodic_maintenance', 'assigned', current_date, $5) returning id`,
        [ids.org, ids.branch, customerId, instId, technician],
      );
      await db("insert into work_order_items (organization_id, branch_id, work_order_id, equipment_id, planned_action_type_id) values ($1, $2, $3, $4, $5)", [ids.org, ids.branch, id, eqId, action]);
      return id;
    };
    const mine = await order(techId);
    const notMine = await order(otherTech);

    // En el móvil: menú → órdenes de trabajo → solo la suya.
    await tech.goto("/app");
    expect(await tech.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await tech.getByText("Menú", { exact: true }).click();
    await tech.getByRole("link", { name: "Órdenes de trabajo", exact: true }).click();
    await expect(tech.getByText("Las órdenes que tienes asignadas.")).toBeVisible();
    await expect(tech.locator(`a[href="/app/ordenes-trabajo/${mine}"]`)).toBeVisible();
    await expect(tech.locator(`a[href="/app/ordenes-trabajo/${notMine}"]`)).toHaveCount(0);
    await expect(tech.getByRole("link", { name: "Nueva orden" })).toHaveCount(0);
    // La de otro técnico no existe para él.
    // (La RLS no la devuelve; con el renderizado en streaming la página 404 llega con estado 200.)
    await tech.goto(`/app/ordenes-trabajo/${notMine}`);
    await expect(tech.getByRole("heading", { name: "Esta página no existe" })).toBeVisible();
    await expect(tech.getByText("Hotel Mar · edificio")).toHaveCount(0);

    await tech.goto(`/app/ordenes-trabajo/${mine}`);
    await tech.getByRole("button", { name: "Empezar el trabajo" }).click();
    await expect(tech.getByText("Estado: En curso.")).toBeVisible();
    const form = tech.getByRole("form", { name: /Resultado de BIE-000001/ });
    await form.getByLabel("Resultado", { exact: true }).selectOption({ label: "No conforme" });
    await form.getByLabel("Observaciones", { exact: true }).fill("Manguera agrietada en el tramo final.");
    await form.getByLabel("Registrar también una incidencia").check();
    await form.getByLabel("Incidencia", { exact: true }).fill("Manguera BIE agrietada");
    await form.getByLabel("Gravedad", { exact: true }).selectOption({ label: "Alta" });
    await form.getByRole("button", { name: "Guardar resultado" }).click();
    await expect(tech.getByText("Resultado guardado en el historial del equipo.")).toBeVisible();

    // Foto desde el móvil (almacenamiento privado; se descarga con URL firmada).
    const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await tech.getByLabel("Añadir fotos o documentos").setInputFiles({ name: "bie.png", mimeType: "image/png", buffer: PNG });
    await tech.getByRole("button", { name: "Subir" }).click();
    await expect(tech.getByText("Archivo subido.")).toBeVisible();
    const docLink = tech.getByRole("link", { name: /bie\.png/ });
    const download = await tech.request.get((await docLink.getAttribute("href"))!, { maxRedirects: 0 });
    expect(download.status()).toBe(303);
    expect(download.headers()["location"]).toMatch(/token=/);

    await tech.getByRole("button", { name: "Finalizar la orden" }).click();
    await expect(tech.getByText("Estado: Completada.")).toBeVisible();

    const [rec] = await db<{ result: string; incidents: string; status: string }>(
      `select m.result, (select count(*) from equipment_incidents x where x.work_order_id = w.id) as incidents, w.status
         from work_orders w join equipment_maintenance_records m on m.work_order_id = w.id where w.id = $1`,
      [mine],
    );
    expect(rec).toEqual({ result: "non_compliant", incidents: "1", status: "completed" });
    await mobile.close();
  });
});
