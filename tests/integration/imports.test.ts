import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { OperatorPermission } from "@/lib/permissions";
import { closePool } from "@/server/db/client";
import type { ServiceCtx } from "@/server/modules/branches/service";
import * as imports from "@/server/modules/imports/service";
import * as vehicles from "@/server/modules/vehicles/service";

import { addMember, createCustomers, createOrg, createUser, ownerMemberId, query, type TestOrg } from "./support/db";

/**
 * CASO CRÍTICO 5: una importación incorrecta no deja registros parciales.
 * Importación completa contra la BD real: staging → corrección → confirmación.
 */

const HEADER = "Nombre del cliente;Correo electrónico;Teléfono;Matrícula;Marca;Modelo;Última revisión;Kilómetros;Próxima revisión";

function csv(lines: string[]): Buffer {
  return Buffer.from([HEADER, ...lines].join("\n") + "\n", "utf8");
}

function plate(): string {
  const digits = String(Math.floor(1000 + Math.random() * 8999));
  const letters = "BCDFGHJKLMNPRSTVWXYZ";
  return `${digits} ${Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join("")}`;
}

async function adminOf(o: TestOrg): Promise<ServiceCtx> {
  return { auth: { userId: o.ownerId }, membership: { organizationId: o.orgId, memberId: await ownerMemberId(o), role: "admin", permissions: [] } };
}

async function count(table: "customers" | "vehicles" | "maintenance_records", orgId: string): Promise<number> {
  const [{ n }] = await query<{ n: string }>(`select count(*) as n from ${table} where organization_id = $1`, [orgId]);
  return Number(n);
}

let org: TestOrg;
let admin: ServiceCtx;

beforeAll(async () => {
  await query("delete from private.rate_limit_buckets where key like 'import:%'");
  org = await createOrg("business");
  admin = await adminOf(org);
});
afterAll(closePool);

describe("importación", () => {
  it("R7: completar vehículos existentes sin sobrescribir nada (marca, revisión más reciente, km mayores, contacto vacío)", async () => {
    const o = await createOrg("business");
    const ctx = await adminOf(o);
    const p = plate();
    const [{ id: customerId }] = await query<{ id: string }>(
      "insert into customers (organization_id, branch_id, first_name) values ($1, $2, 'Ana') returning id",
      [o.orgId, o.branchId],
    );
    const [{ id: vehicleId }] = await query<{ id: string }>(
      "insert into vehicles (organization_id, branch_id, customer_id, plate, model) values ($1, $2, $3, $4, 'León') returning id",
      [o.orgId, o.branchId, customerId, p],
    );
    await query(
      "insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, km, work_performed) values ($1, $2, $3, '2025-06-01', 50000, 'Revisión')",
      [o.orgId, o.branchId, vehicleId],
    );

    const id = await imports.uploadImport(ctx, {
      branchId: o.branchId,
      fileName: "actualizar.csv",
      data: csv([`Ana Ruiz;ana-${randomUUID().slice(0, 6)}@correo.test;611 222 333;${p};Seat;Ibiza;10/03/2026;61.000;`]),
    });
    let batch = await imports.getBatch(ctx, id);
    // Sin la opción, la fila se omite y no hay nada que importar.
    expect(batch!.summary).toMatchObject({ duplicatesSkipped: 1, newVehicles: 0 });
    expect(batch!.status).toBe("has_errors");

    await imports.setOptions(ctx, id, { updateExisting: true });
    batch = await imports.getBatch(ctx, id);
    expect(batch).toMatchObject({ status: "validated" });
    expect(batch!.summary).toMatchObject({ updatedVehicles: 1, duplicatesSkipped: 0 });

    const result = await imports.commitImport(ctx, id, false);
    expect(result).toMatchObject({ vehicles: 0, updatedVehicles: 1, maintenanceRecords: 1 });
    const [v] = await query<{ make: string; model: string; last: string; km: number }>(
      "select make, model, last_service_date::text as last, current_km as km from vehicles where id = $1",
      [vehicleId],
    );
    // Marca completada; el modelo que ya había NO se sobrescribe.
    expect(v).toEqual({ make: "Seat", model: "León", last: "2026-03-10", km: 61000 });
    const [c] = await query<{ email: string; phone: string; first_name: string }>("select email::text, phone, first_name from customers where id = $1", [customerId]);
    expect(c.email).toMatch(/^ana-/);
    expect(c).toMatchObject({ phone: "+34611222333", first_name: "Ana" });
    expect(await count("vehicles", o.orgId)).toBe(1);

    // Una revisión más antigua que la última no se añade al historial.
    const old = await imports.uploadImport(ctx, {
      branchId: o.branchId,
      fileName: "antiguo.csv",
      data: csv([`Ana Ruiz;otra@correo.test;;${p};;;01/01/2026;40.000;`]),
    });
    await imports.setOptions(ctx, old, { updateExisting: true });
    expect(await imports.commitImport(ctx, old, false)).toMatchObject({ updatedVehicles: 1, maintenanceRecords: 0 });
    const [after] = await query<{ km: number; email: string }>(
      "select v.current_km as km, c.email::text from vehicles v join customers c on c.id = v.customer_id where v.id = $1",
      [vehicleId],
    );
    expect(after.km).toBe(61000);
    expect(after.email).toMatch(/^ana-/);
  });

  it("staging: valida sin crear ninguna ficha; corregir una fila revalida todo el lote", async () => {
    const p1 = plate();
    const id = await imports.uploadImport(admin, {
      branchId: org.branchId,
      fileName: "clientes.csv",
      data: csv([
        `Laura Martín;laura-${randomUUID().slice(0, 6)}@correo.test;600 123 456;${p1};Seat;Ibiza;15/03/2026;82.000;`,
        `Sin Correo;;;${plate()};;;01/02/2026;;`,
        `Fecha Mala;fecha@correo.test;;${plate()};;;31/02/2026;;`,
      ]),
    });
    expect(await count("customers", org.orgId)).toBe(0);
    let batch = await imports.getBatch(admin, id);
    expect(batch).toMatchObject({ status: "has_errors", rowCount: 3 });
    expect(batch!.summary).toMatchObject({ withErrors: 2, newVehicles: 3 });

    await imports.updateRow(admin, id, 4, { lastService: "28/02/2026" });
    await imports.setOptions(admin, id, { allowNoEmail: true });
    batch = await imports.getBatch(admin, id);
    expect(batch).toMatchObject({ status: "validated", errorCount: 0 });

    const result = await imports.commitImport(admin, id, false);
    expect(result).toMatchObject({ customers: 3, vehicles: 3, maintenanceRecords: 3 });
    expect((await imports.getBatch(admin, id))?.status).toBe("committed");

    const [v] = await query<{ id: string; next: string; km: number; source: string }>(
      `select v.id, v.next_service_date::text as next, v.current_km as km, c.source
         from vehicles v join customers c on c.id = v.customer_id
        where v.organization_id = $1 and v.plate_normalized = $2`,
      [org.orgId, p1.replace(" ", "")],
    );
    expect(v).toMatchObject({ next: "2027-03-15", km: 82000, source: "import" });
    expect((await vehicles.getVehicle(admin, v.id))?.history[0].workPerformed).toBe("Revisión importada");
    await expect(imports.updateRow(admin, id, 2, { name: "Cambio" })).rejects.toMatchObject({ code: "import_invalid", detail: "not_editable" });
  });

  it("no se puede confirmar con errores", async () => {
    const id = await imports.uploadImport(admin, { branchId: org.branchId, fileName: "malo.csv", data: csv([`;sin-nombre@correo.test;;${plate()};;;15/03/2026;;`]) });
    await expect(imports.commitImport(admin, id, false)).rejects.toMatchObject({ code: "import_invalid", detail: "has_errors" });
  });

  it("si la confirmación falla a mitad (límite del plan), no queda NADA guardado", async () => {
    const pro = await createOrg("pro");
    const proAdmin = await adminOf(pro);
    await createCustomers(pro, 149); // queda hueco para 1 cliente
    const id = await imports.uploadImport(proAdmin, {
      branchId: pro.branchId,
      fileName: "dos.csv",
      data: csv([`Uno;uno@correo.test;;${plate()};;;15/03/2026;;`, `Dos;dos@correo.test;;${plate()};;;15/03/2026;;`]),
    });
    const before = { c: await count("customers", pro.orgId), v: await count("vehicles", pro.orgId), m: await count("maintenance_records", pro.orgId) };
    await expect(imports.commitImport(proAdmin, id, false)).rejects.toMatchObject({ code: "plan_limit_reached", detail: "customers" });
    expect({ c: await count("customers", pro.orgId), v: await count("vehicles", pro.orgId), m: await count("maintenance_records", pro.orgId) }).toEqual(before);
    expect((await imports.getBatch(proAdmin, id))?.status).toBe("validated");
    // La comprobación previa lo avisa antes de intentarlo.
    const check = await imports.checkLimits(proAdmin, "pro", (await imports.getBatch(proAdmin, id))!.summary);
    expect(check).toMatchObject({ ok: false, customersNew: 2, customersAvailable: 1 });
  });

  it("si alguien registra la misma matrícula entre la validación y la confirmación, se revierte todo", async () => {
    const p = plate();
    const id = await imports.uploadImport(admin, {
      branchId: org.branchId,
      fileName: "carrera.csv",
      data: csv([`Primero;primero-${randomUUID().slice(0, 6)}@correo.test;;${plate()};;;15/03/2026;;`, `Segundo;segundo-${randomUUID().slice(0, 6)}@correo.test;;${p};;;15/03/2026;;`]),
    });
    const before = await count("customers", org.orgId);
    const [{ id: c }] = await query<{ id: string }>(
      "insert into customers (organization_id, branch_id, first_name) values ($1, $2, 'Manual') returning id",
      [org.orgId, org.branchId],
    );
    await query("insert into vehicles (organization_id, branch_id, customer_id, plate) values ($1, $2, $3, $4)", [org.orgId, org.branchId, c, p]);
    await expect(imports.commitImport(admin, id, false)).rejects.toMatchObject({ code: "conflict", detail: "vehicles_plate_unique" });
    expect(await count("customers", org.orgId)).toBe(before + 1); // solo el creado a mano
  });

  it("dos confirmaciones simultáneas del mismo lote importan una sola vez", async () => {
    const id = await imports.uploadImport(admin, {
      branchId: org.branchId,
      fileName: "doble.csv",
      data: csv([`Doble;doble-${randomUUID().slice(0, 6)}@correo.test;;${plate()};;;15/03/2026;;`]),
    });
    const before = await count("vehicles", org.orgId);
    const results = await Promise.allSettled([imports.commitImport(admin, id, false), imports.commitImport(admin, id, false)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "import_invalid", detail: "already_committed" });
    expect(await count("vehicles", org.orgId)).toBe(before + 1);
  });

  it("el mismo archivo otra vez: aviso y confirmación expresa; los vehículos existentes se omiten", async () => {
    const data = csv([`Repetido;repetido-${randomUUID().slice(0, 6)}@correo.test;;${plate()};;;15/03/2026;;`]);
    const first = await imports.uploadImport(admin, { branchId: org.branchId, fileName: "a.csv", data });
    await imports.commitImport(admin, first, false);
    const second = await imports.uploadImport(admin, { branchId: org.branchId, fileName: "a.csv", data });
    const batch = await imports.getBatch(admin, second);
    expect(batch?.summary).toMatchObject({ repeatedFile: true, duplicatesSkipped: 1, newVehicles: 0 });
    expect(batch?.status).toBe("has_errors"); // nada que importar
    await expect(imports.commitImport(admin, second, true)).rejects.toMatchObject({ code: "import_invalid" });
  });

  it("vincula a clientes existentes por correo y agrupa varios vehículos del mismo cliente", async () => {
    const email = `familia-${randomUUID().slice(0, 6)}@correo.test`;
    const [{ id: existing }] = await query<{ id: string }>(
      "insert into customers (organization_id, branch_id, first_name, email) values ($1, $2, 'Existente', $3) returning id",
      [org.orgId, org.branchId, email],
    );
    const nuevo = `nuevo-${randomUUID().slice(0, 6)}@correo.test`;
    const id = await imports.uploadImport(admin, {
      branchId: org.branchId,
      fileName: "grupo.csv",
      data: csv([`Existente;${email};;${plate()};;;15/03/2026;;`, `Nuevo;${nuevo};;${plate()};;;15/03/2026;;`, `Nuevo;${nuevo};;${plate()};;;16/03/2026;;`]),
    });
    expect((await imports.getBatch(admin, id))?.summary).toMatchObject({ newCustomers: 1, existingCustomers: 1, newVehicles: 3 });
    expect(await imports.commitImport(admin, id, false)).toMatchObject({ customers: 1, attachedCustomers: 1, vehicles: 3 });
    const [{ n }] = await query<{ n: string }>("select count(*) as n from vehicles where customer_id = $1", [existing]);
    expect(Number(n)).toBe(1);
    const [{ n: m }] = await query<{ n: string }>(
      "select count(*) as n from vehicles v join customers c on c.id = v.customer_id where c.email = $1 and c.organization_id = $2",
      [nuevo, org.orgId],
    );
    expect(Number(m)).toBe(2);
  });

  it("otro taller no ve ni toca el lote; un operario sin imports.run tampoco", async () => {
    const id = await imports.uploadImport(admin, { branchId: org.branchId, fileName: "privado.csv", data: csv([`Privado;privado@correo.test;;${plate()};;;15/03/2026;;`]) });
    const other = await adminOf(await createOrg("max"));
    expect(await imports.getBatch(other, id)).toBeNull();
    expect((await imports.listRows(other, id, { filter: "all", page: 1, pageSize: 50 })).rows).toHaveLength(0);
    await expect(imports.commitImport(other, id, false)).rejects.toMatchObject({ code: "not_found" });
    const forged: ServiceCtx = { ...other, membership: { ...other.membership, organizationId: org.orgId } };
    await expect(imports.updateRow(forged, id, 2, { name: "Hack" })).rejects.toMatchObject({ code: "not_found" });

    const user = await createUser();
    const perms: OperatorPermission[] = ["customers.write", "vehicles.write", "maintenance.write"];
    const memberId = await addMember(org, user, "operator", perms);
    const op: ServiceCtx = { auth: { userId: user }, membership: { organizationId: org.orgId, memberId, role: "operator", permissions: perms } };
    expect(await imports.getBatch(op, id)).toBeNull();
    await expect(imports.uploadImport(op, { branchId: org.branchId, fileName: "x.csv", data: csv([`X;x@correo.test;;${plate()};;;15/03/2026;;`]) })).rejects.toMatchObject({
      code: "permission_denied",
    });
  });

  it("2.000 filas: se validan y se importan en una sola transacción en un tiempo razonable", async () => {
    const big = await createOrg("business");
    const bigAdmin = await adminOf(big);
    const lines = Array.from({ length: 2000 }, (_, i) => `Cliente ${i};cliente${i}@correo.test;;${String(1000 + (i % 9000)).padStart(4, "0")}${["BCD", "FGH", "JKL"][Math.floor(i / 9000)] ?? "BCD"}${i >= 1000 ? "X" : ""};Seat;Ibiza;15/03/2026;${50000 + i};`);
    const t0 = Date.now();
    const id = await imports.uploadImport(bigAdmin, { branchId: big.branchId, fileName: "grande.csv", data: csv(lines) });
    const t1 = Date.now();
    const batch = await imports.getBatch(bigAdmin, id);
    expect(batch?.summary).toMatchObject({ rows: 2000, withErrors: 0, newVehicles: 2000, newCustomers: 2000 });
    await imports.commitImport(bigAdmin, id, false);
    const t2 = Date.now();
    expect(await count("vehicles", big.orgId)).toBe(2000);
    expect(await count("maintenance_records", big.orgId)).toBe(2000);
    console.log(`2.000 filas: staging ${t1 - t0} ms, confirmación ${t2 - t1} ms`);
    expect(t2 - t0).toBeLessThan(25_000);
  }, 60_000);
});
