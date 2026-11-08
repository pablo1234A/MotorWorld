import { expect, type Page, test } from "@playwright/test";

import { db, grantPlan, uniqueEmail } from "./support/env";
import { createWorkshop, signUpAndVerify } from "./support/flows";

/**
 * Funciones de vehículos de la etapa anterior de RevisaYa. Desde el paso a
 * protección contra incendios solo aparecen en las cuentas que ya tienen
 * vehículos: cada prueba simula esa cuenta con un vehículo previo y después
 * recorre la interfaz igual que antes (no se pierde cobertura).
 */
async function seedLegacyVehicle(owner: string): Promise<void> {
  await db(
    `with o as (select m.organization_id as org, b.id as branch from organization_members m join profiles p on p.id = m.user_id
                  join branches b on b.organization_id = m.organization_id and b.is_primary where p.email = $1),
          c as (insert into customers (organization_id, branch_id, first_name, last_name) select org, branch, 'Cliente', 'Anterior' from o returning id, organization_id, branch_id)
     insert into vehicles (organization_id, branch_id, customer_id, plate) select organization_id, branch_id, id, '0001 AAA' from c`,
    [owner],
  );
}

/** Tarjeta (<section>) del panel identificada por su título. */
const card = (page: Page, title: string) => page.locator("section", { has: page.getByRole("heading", { name: title, exact: true }) });

test.describe("Clientes, vehículos e historial", () => {
  test.beforeEach(async ({ page }) => {
    // Los borrados piden confirmación con window.confirm: se acepta.
    page.on("dialog", (d) => d.accept());
  });

  test("ficha completa: cliente → vehículo con última revisión → nueva revisión con piezas → km", async ({ page }) => {
    const owner = uniqueEmail("taller");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller Sur");
    await grantPlan(owner, "max");
    await seedLegacyVehicle(owner);

    // Cliente
    await page.getByRole("link", { name: "Clientes", exact: true }).click();
    await page.getByRole("link", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Particular").check();
    await page.getByLabel("Nombre", { exact: true }).fill("Laura");
    await page.getByLabel("Apellidos").fill("Martín");
    await page.getByLabel("Correo electrónico").fill("laura@correo.test");
    await page.getByLabel("Teléfono").fill("600 123 456");
    await page.getByRole("button", { name: "Crear cliente" }).click();
    await expect(page.getByText("Cliente creado.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Laura Martín" })).toBeVisible();
    await expect(card(page, "Datos del cliente").getByLabel("Teléfono")).toHaveValue("600 123 456");

    // Vehículo con su última revisión (ejemplo del PDF)
    const add = card(page, "Añadir vehículo");
    await add.getByLabel("Matrícula").fill("1234 BCD");
    await add.getByLabel("Marca").fill("Seat");
    await add.getByLabel("Modelo").fill("Ibiza");
    await add.getByLabel("Fecha", { exact: true }).fill("2026-03-15");
    await add.getByLabel("Kilómetros", { exact: true }).fill("82000");
    await add.getByRole("button", { name: "Dar de alta el vehículo" }).click();
    await expect(page.getByText("Vehículo dado de alta.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "1234 BCD" })).toBeVisible();
    await expect(page.getByText("15/03/2027", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Última revisión (registrada al dar de alta el vehículo)")).toBeVisible();

    // Nueva revisión con piezas: recalcula la próxima
    const rev = card(page, "Registrar revisión");
    await rev.getByLabel("Fecha de la revisión").fill("2026-10-20");
    await rev.getByLabel("Kilómetros", { exact: true }).fill("96500");
    await rev.getByLabel("Trabajos realizados").fill("Cambio de aceite y filtros");
    await rev.getByRole("button", { name: "Añadir pieza" }).click();
    await rev.getByLabel("Pieza 1", { exact: true }).fill("Aceite 5W30");
    await rev.getByLabel("Cantidad", { exact: true }).fill("4.5");
    await rev.getByRole("button", { name: "Registrar revisión" }).click();
    await expect(page.getByText("Revisión registrada.")).toBeVisible();
    await expect(page.getByText("Historial (2)")).toBeVisible();
    await expect(page.getByText("4,5 × Aceite 5W30")).toBeVisible();
    await expect(page.getByText("20/10/2027").first()).toBeVisible();

    // Kilómetros: una lectura menor exige confirmación
    const km = card(page, "Actualizar kilómetros");
    await km.getByLabel("Kilómetros", { exact: true }).fill("1000");
    await km.getByRole("button", { name: "Actualizar kilómetros" }).click();
    await expect(km.getByText("Los kilómetros son menores que los actuales.")).toBeVisible();
    await km.getByLabel("Kilómetros", { exact: true }).fill("97000");
    await km.getByRole("button", { name: "Actualizar kilómetros" }).click();
    await expect(km.getByText("Kilómetros actualizados.")).toBeVisible();
    await expect(page.getByText("97.000 km").first()).toBeVisible();

    // Búsqueda por matrícula desde el listado de clientes
    await page.getByRole("link", { name: "Clientes", exact: true }).click();
    await page.getByLabel("Buscar").fill("1234bcd");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByRole("link", { name: "Laura Martín" })).toBeVisible();
    await page.getByLabel("Buscar").fill("nadie-asi");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByText("Ningún cliente coincide con la búsqueda.")).toBeVisible();

    // Historial global de vehículos (etapa anterior)
    await page.goto("/app/historial");
    await expect(page.getByRole("heading", { name: "Historial de vehículos (etapa anterior)" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Cambio de aceite y filtros" })).toBeVisible();

    // Panel: los contadores son reales y los vehículos conservados se indican
    await page.getByRole("link", { name: "Inicio" }).click();
    await expect(page.getByText("de 800 en tu plan")).toBeVisible();
    await expect(page.getByText("La cuenta conserva 2 vehículos de la etapa anterior de RevisaYa")).toBeVisible();
  });

  test("aviso de cliente duplicado, revisiones vencidas y borrado seguro con vehículos", async ({ page }) => {
    const owner = uniqueEmail("borra");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller Norte");
    await grantPlan(owner, "pro");
    await seedLegacyVehicle(owner);

    const create = async (name: string, email: string) => {
      await page.goto("/app/clientes/nuevo");
      await page.getByLabel("Particular").check();
      await page.getByLabel("Nombre", { exact: true }).fill(name);
      await page.getByLabel("Correo electrónico").fill(email);
      await page.getByRole("button", { name: "Crear cliente" }).click();
    };
    await create("Pedro", "pedro@correo.test");
    await expect(page.getByText("Cliente creado.")).toBeVisible();
    const customerUrl = page.url();

    // Vehículo con revisión antigua ⇒ próxima revisión vencida
    const add = card(page, "Añadir vehículo");
    await add.getByLabel("Matrícula").fill("5678 FGH");
    await add.getByLabel("Fecha", { exact: true }).fill("2024-01-10");
    await add.getByRole("button", { name: "Dar de alta el vehículo" }).click();
    await expect(page.getByText("Vehículo dado de alta.")).toBeVisible();

    await page.goto("/app/vehiculos");
    await page.getByLabel("Próxima revisión").selectOption({ label: "Revisión vencida" });
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/revision=vencidas/);
    await expect(page.getByRole("link", { name: "5678 FGH" })).toBeVisible();

    // Duplicado por correo: avisa y solo crea si se confirma
    await create("Pedro bis", "pedro@correo.test");
    await expect(page.getByText("Posible cliente repetido")).toBeVisible();
    await page.getByLabel("Es otra persona: crear igualmente").check();
    await page.getByRole("button", { name: "Crear cliente" }).click();
    await expect(page.getByText("Cliente creado.")).toBeVisible();

    // Matrícula repetida en el mismo taller
    const add2 = card(page, "Añadir vehículo");
    await add2.getByLabel("Matrícula").fill("5678-fgh");
    await add2.getByRole("button", { name: "Dar de alta el vehículo" }).click();
    await expect(page.getByText("Ya existe un vehículo con esa matrícula en esta empresa.")).toBeVisible();

    // Borrado: con vehículos hay que marcar que se borran también
    await page.goto(customerUrl);
    const del = card(page, "Borrar cliente");
    await expect(del.getByRole("button", { name: "Borrar cliente" })).toBeDisabled();
    await del.getByLabel("Borrar también sus 1 vehículo").check();
    await del.getByRole("button", { name: "Borrar cliente" }).click();
    await expect(page).toHaveURL(/\/app\/clientes\?borrado=1/);
    await expect(page.getByText("Cliente borrado.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Pedro bis" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pedro", exact: true })).toHaveCount(0);

    // Papelera: se puede restaurar (con su vehículo) durante 30 días
    await page.getByRole("link", { name: "Papelera" }).click();
    const trashCustomers = card(page, "Clientes borrados (1)");
    await expect(trashCustomers.getByText("Pedro", { exact: true })).toBeVisible();
    await expect(trashCustomers.getByText(/1 vehículo · borrado el/)).toBeVisible();
    await trashCustomers.getByRole("button", { name: "Restaurar" }).click();
    await expect(page.getByText("Cliente restaurado con 1 vehículo.")).toBeVisible();
    await page.goto("/app/vehiculos?revision=vencidas");
    await expect(page.getByRole("link", { name: "5678 FGH" })).toBeVisible();
  });

  test("sin plan activo: modo de solo lectura (consultar sí, crear no)", async ({ page }) => {
    const owner = uniqueEmail("lectura");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller Lectura");
    await grantPlan(owner, "pro");
    await seedLegacyVehicle(owner);
    await page.goto("/app/clientes/nuevo");
    await page.getByLabel("Particular").check();
    await page.getByLabel("Nombre", { exact: true }).fill("Ana");
    await page.getByRole("button", { name: "Crear cliente" }).click();
    await expect(page.getByText("Cliente creado.")).toBeVisible();

    await db(
      `update subscriptions set status = 'canceled' where organization_id = (
         select m.organization_id from organization_members m join profiles p on p.id = m.user_id where p.email = $1)`,
      [owner],
    );
    await page.goto("/app/clientes");
    await expect(page.getByText("Modo de solo lectura")).toBeVisible();
    await expect(page.getByRole("link", { name: "Nuevo cliente" })).toHaveCount(0);
    await page.getByRole("link", { name: "Ana" }).click();
    await expect(page.getByRole("heading", { name: "Ana" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Añadir vehículo" })).toHaveCount(0);
    await page.goto("/app/clientes/nuevo");
    await expect(page.getByText("Tu empresa no tiene un plan activo.")).toBeVisible();
    // PCI: tampoco se crean instalaciones, equipos ni órdenes.
    await page.goto("/app/instalaciones");
    await expect(page.getByText("Modo de solo lectura")).toBeVisible();
    await expect(page.getByRole("link", { name: "Nueva instalación" })).toHaveCount(0);
    await page.goto("/app/ordenes-trabajo");
    await expect(page.getByRole("link", { name: "Nueva orden" })).toHaveCount(0);
  });
});
