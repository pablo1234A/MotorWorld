import { expect, type Page, test } from "@playwright/test";

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
});
