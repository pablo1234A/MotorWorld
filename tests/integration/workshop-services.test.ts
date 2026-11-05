import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { OperatorPermission } from "@/lib/permissions";
import { closePool } from "@/server/db/client";
import type { ServiceCtx } from "@/server/modules/branches/service";
import * as customers from "@/server/modules/customers/service";
import * as maintenance from "@/server/modules/maintenance/service";
import * as vehicles from "@/server/modules/vehicles/service";

import { addMember, createOrg, createUser, ownerMemberId, query, type TestOrg } from "./support/db";

/**
 * Clientes, vehículos e historial a través de los servicios (camino real de
 * las Server Actions), con usuarios reales y RLS.
 */

let org: TestOrg;
let other: TestOrg;
let admin: ServiceCtx;
let otherAdmin: ServiceCtx;

async function operator(o: TestOrg, permissions: OperatorPermission[]): Promise<ServiceCtx> {
  const user = await createUser();
  const memberId = await addMember(o, user, "operator", permissions);
  return { auth: { userId: user }, membership: { organizationId: o.orgId, memberId, role: "operator", permissions } };
}

const customerInput = (o: TestOrg, firstName: string, extra: Partial<Parameters<typeof customers.createCustomer>[1]> = {}) => ({
  branchId: o.branchId,
  firstName,
  lastName: "Prueba",
  email: null,
  phone: null,
  source: "manual" as const,
  notes: null,
  remindersOptOut: false,
  confirmDuplicate: false,
  ...extra,
});

async function newCustomer(ctx: ServiceCtx, o: TestOrg, firstName: string, extra = {}) {
  const r = await customers.createCustomer(ctx, customerInput(o, firstName, extra));
  if (r.kind !== "created") throw new Error("duplicado inesperado");
  return r.id;
}

const vehicleInput = (customerId: string, plate: string, extra = {}) => ({
  customerId,
  plate,
  make: "Seat",
  model: "Ibiza",
  vin: null,
  currentKm: null,
  lastServiceDate: null,
  lastServiceKm: null,
  nextServiceDate: null,
  ...extra,
});

beforeAll(async () => {
  org = await createOrg("business"); // usuarios ilimitados: el test crea varios operarios
  other = await createOrg("max");
  admin = { auth: { userId: org.ownerId }, membership: { organizationId: org.orgId, memberId: await ownerMemberId(org), role: "admin", permissions: [] } };
  otherAdmin = { auth: { userId: other.ownerId }, membership: { organizationId: other.orgId, memberId: await ownerMemberId(other), role: "admin", permissions: [] } };
});
afterAll(closePool);

describe("clientes", () => {
  it("alta, detección de duplicados por correo y teléfono, y alta confirmada", async () => {
    const email = `laura-${randomUUID().slice(0, 6)}@cliente.test`;
    await newCustomer(admin, org, "Laura", { email, phone: "+34600111222" });

    const dup = await customers.createCustomer(admin, customerInput(org, "Laura bis", { email }));
    expect(dup.kind).toBe("duplicates");
    if (dup.kind === "duplicates") expect(dup.matches[0]).toMatchObject({ reason: "email" });
    const dupPhone = await customers.createCustomer(admin, customerInput(org, "Otra", { phone: "+34600111222" }));
    expect(dupPhone.kind).toBe("duplicates");

    const confirmed = await customers.createCustomer(admin, customerInput(org, "Laura bis", { email, confirmDuplicate: true }));
    expect(confirmed.kind).toBe("created");
  });

  it("búsqueda por nombre, correo, teléfono y matrícula; paginación en servidor", async () => {
    const tag = randomUUID().slice(0, 6);
    const id = await newCustomer(admin, org, `Búsqueda${tag}`, { email: `busca-${tag}@cliente.test`, phone: "+34699888777" });
    await vehicles.createVehicle(admin, vehicleInput(id, `9${tag.replace(/[^0-9]/g, "0").slice(0, 3)}XYZ`));
    for (const q of [`búsqueda${tag}`, `busca-${tag}`, "699 888", `9${tag.replace(/[^0-9]/g, "0").slice(0, 3)}xyz`]) {
      const page = await customers.listCustomers(admin, { q, page: 1, pageSize: 25 });
      expect(page.rows.map((r) => r.id), `búsqueda «${q}»`).toContain(id);
    }
    // Los comodines escritos por el usuario no se interpretan.
    expect((await customers.listCustomers(admin, { q: "%", page: 1, pageSize: 25 })).total).toBe(0);

    for (let i = 0; i < 6; i++) await newCustomer(admin, org, `Página${tag}${i}`);
    const p1 = await customers.listCustomers(admin, { q: `página${tag}`, page: 1, pageSize: 4, sort: "name" });
    const p2 = await customers.listCustomers(admin, { q: `página${tag}`, page: 2, pageSize: 4, sort: "name" });
    expect(p1.total).toBe(6);
    expect(p1.rows).toHaveLength(4);
    expect(p2.rows).toHaveLength(2);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(6);
  });

  it("un taller no ve, edita ni borra clientes de otro", async () => {
    const id = await newCustomer(admin, org, "Privado");
    expect(await customers.getCustomer(otherAdmin, id)).toBeNull();
    expect((await customers.listCustomers(otherAdmin, { q: "Privado", page: 1, pageSize: 25 })).rows.map((r) => r.id)).not.toContain(id);
    await expect(customers.updateCustomer(otherAdmin, { ...customerInput(org, "Hack"), id, source: "manual" })).rejects.toMatchObject({ code: "not_found" });
    await expect(customers.deleteCustomer(otherAdmin, id, true)).rejects.toMatchObject({ code: "not_found" });
    // Ni falsificando la organización en el contexto.
    const forged: ServiceCtx = { ...otherAdmin, membership: { ...otherAdmin.membership, organizationId: org.orgId } };
    expect(await customers.getCustomer(forged, id)).toBeNull();
    await expect(customers.deleteCustomer(forged, id, true)).rejects.toMatchObject({ code: "not_found" });
    expect((await customers.getCustomer(admin, id))?.firstName).toBe("Privado");
  });

  it("permisos de operario: consulta sí, escritura y borrado según permisos", async () => {
    const reader = await operator(org, []);
    const id = await newCustomer(admin, org, "Consulta");
    expect((await customers.getCustomer(reader, id))?.firstName).toBe("Consulta");
    await expect(customers.createCustomer(reader, customerInput(org, "No"))).rejects.toMatchObject({ code: "permission_denied" });
    await expect(customers.updateCustomer(reader, { ...customerInput(org, "Cambio"), id, source: "manual" })).rejects.toMatchObject({ code: "permission_denied" });

    const writer = await operator(org, ["customers.write"]);
    await customers.updateCustomer(writer, { ...customerInput(org, "Cambiado"), id, source: "manual" });
    await expect(customers.deleteCustomer(writer, id, false)).rejects.toMatchObject({ code: "permission_denied" });
    expect((await customers.getCustomer(admin, id))?.firstName).toBe("Cambiado");
  });

  it("borrado seguro: con vehículos exige borrarlos también, en la misma transacción, y conserva el historial", async () => {
    const id = await newCustomer(admin, org, "Borrable");
    const v = await vehicles.createVehicle(admin, vehicleInput(id, `B${randomUUID().slice(0, 5).replace(/[^0-9]/g, "1")}BB`, { lastServiceDate: "2026-01-10", lastServiceKm: 50000 }));

    await expect(customers.deleteCustomer(admin, id, false)).rejects.toMatchObject({ code: "integrity_violation", detail: "customer_has_vehicles" });
    expect(await customers.getCustomer(admin, id)).not.toBeNull();

    // Operario con customers.delete pero sin vehicles.delete: la BD revierte TODO.
    const partial = await operator(org, ["customers.write", "customers.delete"]);
    await expect(customers.deleteCustomer(partial, id, true)).rejects.toMatchObject({ code: "permission_denied" });
    const [{ deleted }] = await query<{ deleted: boolean }>("select deleted_at is not null as deleted from vehicles where id = $1", [v]);
    expect(deleted).toBe(false);

    await expect(customers.deleteCustomer(admin, id, true)).resolves.toEqual({ vehicles: 1 });
    expect(await customers.getCustomer(admin, id)).toBeNull();
    expect(await vehicles.getVehicle(admin, v)).toBeNull();
    const [{ n }] = await query<{ n: string }>("select count(*) as n from maintenance_records where vehicle_id = $1", [v]);
    expect(Number(n)).toBe(1);
  });
});

describe("vehículos", () => {
  it("alta con última revisión: se registra en el historial y calcula la próxima", async () => {
    const id = await newCustomer(admin, org, "Ficha");
    const v = await vehicles.createVehicle(admin, vehicleInput(id, "4521 GHT", { lastServiceDate: "2026-03-15", lastServiceKm: 82000 }));
    const detail = await vehicles.getVehicle(admin, v);
    expect(detail).toMatchObject({
      plate: "4521 GHT",
      lastServiceDate: "2026-03-15",
      lastServiceKm: 82000,
      nextServiceDate: "2027-03-15",
      nextServiceKm: 97000,
      currentKm: 82000,
      customer: { id },
    });
    expect(detail?.history).toHaveLength(1);
  });

  it("matrícula duplicada en el mismo taller: conflicto; en otro taller: permitida", async () => {
    const plate = `7${randomUUID().replace(/[^0-9]/g, "").slice(0, 3)}KLM`;
    const a = await newCustomer(admin, org, "Uno");
    await vehicles.createVehicle(admin, vehicleInput(a, plate));
    await expect(vehicles.createVehicle(admin, vehicleInput(a, plate.toLowerCase().replace(/(\d{4})/, "$1-")))).rejects.toMatchObject({
      code: "conflict",
      detail: "vehicles_plate_unique",
    });
    const b = await newCustomer(otherAdmin, other, "Otro taller");
    await expect(vehicles.createVehicle(otherAdmin, vehicleInput(b, plate))).resolves.toBeTruthy();
  });

  it("no se puede crear un vehículo para un cliente de otro taller", async () => {
    const foreign = await newCustomer(otherAdmin, other, "Ajeno");
    await expect(vehicles.createVehicle(admin, vehicleInput(foreign, "1111FFF"))).rejects.toMatchObject({ code: "not_found" });
  });

  it("kilómetros: lectura manual, y una lectura menor exige confirmación", async () => {
    const id = await newCustomer(admin, org, "Km");
    const v = await vehicles.createVehicle(admin, vehicleInput(id, `K${randomUUID().replace(/[^0-9]/g, "").slice(0, 4)}KM`, { currentKm: 90000 }));
    await vehicles.recordMileage(admin, { id: v, km: 95000, readOn: "2026-10-01", confirmLower: false });
    await expect(vehicles.recordMileage(admin, { id: v, km: 1000, readOn: "2026-10-02", confirmLower: false })).rejects.toMatchObject({
      code: "validation_error",
      detail: "km_lower_than_current",
    });
    await vehicles.recordMileage(admin, { id: v, km: 1000, readOn: "2026-10-02", confirmLower: true });
    const d = await vehicles.getVehicle(admin, v);
    expect(d?.currentKm).toBe(1000);
    expect(d?.mileage.map((m) => m.km)).toEqual([1000, 95000]);
    await expect(vehicles.recordMileage(admin, { id: v, km: 1200, readOn: "2099-01-01", confirmLower: false })).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("cambio de propietario: conserva el historial; no entre sucursales", async () => {
    const bus = await createOrg("business");
    const busAdmin: ServiceCtx = { auth: { userId: bus.ownerId }, membership: { organizationId: bus.orgId, memberId: await ownerMemberId(bus), role: "admin", permissions: [] } };
    const [{ id: branch2 }] = await query<{ id: string }>(
      "insert into branches (organization_id, name, slug) values ($1, 'Norte', 'norte') returning id",
      [bus.orgId],
    );
    const c1 = await newCustomer(busAdmin, bus, "Vendedor");
    const c2 = await newCustomer(busAdmin, bus, "Comprador");
    const cOther = await newCustomer(busAdmin, { ...bus, branchId: branch2 }, "De otra sucursal");
    const v = await vehicles.createVehicle(busAdmin, vehicleInput(c1, "2222CCC", { lastServiceDate: "2025-05-05", lastServiceKm: 40000 }));
    await maintenance.createRecord(busAdmin, v, { serviceDate: "2026-05-05", km: 55000, workPerformed: "Frenos", notes: null, nextRecommendedDate: null, nextRecommendedKm: null, parts: [] });

    await vehicles.changeOwner(busAdmin, v, c2);
    const d = await vehicles.getVehicle(busAdmin, v);
    expect(d?.customer.id).toBe(c2);
    expect(d?.history).toHaveLength(2);
    expect(d?.history.every((h) => h.ownerName === "Vendedor Prueba")).toBe(true);

    await expect(vehicles.changeOwner(busAdmin, v, cOther)).rejects.toMatchObject({ code: "integrity_violation", detail: "owner_other_branch" });
  });

  it("próxima revisión manual y su validación contra la última revisión", async () => {
    const id = await newCustomer(admin, org, "Manual");
    const v = await vehicles.createVehicle(admin, vehicleInput(id, `M${randomUUID().replace(/[^0-9]/g, "").slice(0, 4)}MN`, { lastServiceDate: "2026-06-01" }));
    await vehicles.setNextService(admin, { id: v, nextServiceDate: "2026-12-01", nextServiceKm: null });
    expect((await vehicles.getVehicle(admin, v))?.nextServiceSource).toBe("manual");
    await expect(vehicles.setNextService(admin, { id: v, nextServiceDate: "2026-01-01", nextServiceKm: null })).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("listado: filtros de revisión vencida y próxima", async () => {
    const id = await newCustomer(admin, org, "Vencido");
    const overdue = await vehicles.createVehicle(admin, vehicleInput(id, `V${randomUUID().replace(/[^0-9]/g, "").slice(0, 4)}VV`, { lastServiceDate: "2024-01-10" }));
    const today = "2026-11-05";
    const list = await vehicles.listVehicles(admin, { due: "overdue", page: 1, pageSize: 100 }, today);
    expect(list.rows.map((r) => r.id)).toContain(overdue);
    expect(list.rows.every((r) => r.nextServiceDate !== null && r.nextServiceDate < today)).toBe(true);
    const soon = await vehicles.listVehicles(admin, { due: "30", page: 1, pageSize: 100 }, today);
    expect(soon.rows.every((r) => r.nextServiceDate! >= today && r.nextServiceDate! <= "2026-12-05")).toBe(true);
  });
});

describe("sucursales", () => {
  it("un operario limitado a una sucursal solo ve y crea en la suya; el administrador ve todas", async () => {
    const bus = await createOrg("business");
    const busAdmin: ServiceCtx = { auth: { userId: bus.ownerId }, membership: { organizationId: bus.orgId, memberId: await ownerMemberId(bus), role: "admin", permissions: [] } };
    const [{ id: north }] = await query<{ id: string }>("insert into branches (organization_id, name, slug) values ($1, 'Norte', 'norte') returning id", [bus.orgId]);
    const centro = await newCustomer(busAdmin, bus, "Centro");
    const norte = await newCustomer(busAdmin, { ...bus, branchId: north }, "Norte");

    const user = await createUser();
    const [{ id: memberId }] = await query<{ id: string }>(
      "insert into organization_members (organization_id, user_id, role, permissions, branch_scope) values ($1, $2, 'operator', '{customers.write}', 'selected') returning id",
      [bus.orgId, user],
    );
    await query("insert into member_branches (member_id, organization_id, branch_id) values ($1, $2, $3)", [memberId, bus.orgId, north]);
    const op: ServiceCtx = { auth: { userId: user }, membership: { organizationId: bus.orgId, memberId, role: "operator", permissions: ["customers.write"] } };

    const seen = (await customers.listCustomers(op, { page: 1, pageSize: 50 })).rows.map((r) => r.id);
    expect(seen).toEqual([norte]);
    expect(await customers.getCustomer(op, centro)).toBeNull();
    await expect(customers.createCustomer(op, customerInput(bus, "En Centro"))).rejects.toMatchObject({ code: "permission_denied" });
    await expect(customers.createCustomer(op, customerInput({ ...bus, branchId: north }, "En Norte"))).resolves.toMatchObject({ kind: "created" });

    const all = (await customers.listCustomers(busAdmin, { page: 1, pageSize: 50 })).rows;
    expect(new Set(all.map((r) => r.branchName))).toEqual(new Set(["Principal", "Norte"]));
    const onlyNorth = await customers.listCustomers(busAdmin, { branchId: north, page: 1, pageSize: 50 });
    expect(onlyNorth.rows.every((r) => r.branchName === "Norte")).toBe(true);
  });
});

describe("historial", () => {
  it("revisión con piezas: actualiza la ficha; editar sustituye las piezas; borrar solo administradores", async () => {
    const id = await newCustomer(admin, org, "Historial");
    const v = await vehicles.createVehicle(admin, vehicleInput(id, `H${randomUUID().replace(/[^0-9]/g, "").slice(0, 4)}HH`));
    const mechanic = await operator(org, ["maintenance.write"]);
    const rec = await maintenance.createRecord(mechanic, v, {
      serviceDate: "2026-10-20",
      km: 61000,
      workPerformed: "Cambio de aceite y filtros",
      notes: null,
      nextRecommendedDate: "2027-10-20",
      nextRecommendedKm: 76000,
      parts: [
        { description: "Aceite 5W30", reference: null, quantity: 4.5 },
        { description: "Filtro de aceite", reference: "OC-90", quantity: 1 },
      ],
    });
    let d = await vehicles.getVehicle(admin, v);
    expect(d).toMatchObject({ lastServiceDate: "2026-10-20", nextServiceDate: "2027-10-20", nextServiceKm: 76000, currentKm: 61000 });
    expect(d?.history[0].parts.map((p) => [p.description, Number(p.quantity)])).toEqual([
      ["Aceite 5W30", 4.5],
      ["Filtro de aceite", 1],
    ]);

    await maintenance.updateRecord(mechanic, rec, {
      serviceDate: "2026-10-21",
      km: 61010,
      workPerformed: "Cambio de aceite",
      notes: "Corregida la fecha",
      nextRecommendedDate: null,
      nextRecommendedKm: null,
      parts: [{ description: "Aceite 5W30", reference: null, quantity: 4 }],
    });
    d = await vehicles.getVehicle(admin, v);
    expect(d?.history[0]).toMatchObject({ serviceDate: "2026-10-21", notes: "Corregida la fecha" });
    expect(d?.history[0].parts).toHaveLength(1);
    expect(d?.nextServiceDate).toBe("2027-10-21");

    await expect(maintenance.deleteRecord(mechanic, rec)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(maintenance.createRecord(mechanic, v, { serviceDate: "2099-01-01", km: null, workPerformed: "x", notes: null, nextRecommendedDate: null, nextRecommendedKm: null, parts: [] })).rejects.toMatchObject({
      code: "validation_error",
      detail: "service_date_in_future",
    });
    await maintenance.deleteRecord(admin, rec);
    d = await vehicles.getVehicle(admin, v);
    expect(d?.history).toHaveLength(0);
    expect(d?.lastServiceDate).toBeNull();
  });

  it("un operario sin maintenance.write no registra revisiones; otro taller no ve el historial", async () => {
    const id = await newCustomer(admin, org, "SinPermiso");
    const v = await vehicles.createVehicle(admin, vehicleInput(id, `P${randomUUID().replace(/[^0-9]/g, "").slice(0, 4)}PP`));
    const reader = await operator(org, ["customers.write"]);
    await expect(
      maintenance.createRecord(reader, v, { serviceDate: "2026-10-01", km: null, workPerformed: "x", notes: null, nextRecommendedDate: null, nextRecommendedKm: null, parts: [] }),
    ).rejects.toMatchObject({ code: "permission_denied" });
    await maintenance.createRecord(admin, v, { serviceDate: "2026-10-01", km: null, workPerformed: "Revisión", notes: null, nextRecommendedDate: null, nextRecommendedKm: null, parts: [] });
    const mine = await maintenance.listHistory(admin, { q: "sinpermiso", page: 1, pageSize: 25 });
    expect(mine.total).toBeGreaterThanOrEqual(1);
    const theirs = await maintenance.listHistory(otherAdmin, { q: "sinpermiso", page: 1, pageSize: 25 });
    expect(theirs.total).toBe(0);
  });

  it("con la suscripción cancelada todo queda en solo lectura", async () => {
    const o = await createOrg("pro");
    const ctx: ServiceCtx = { auth: { userId: o.ownerId }, membership: { organizationId: o.orgId, memberId: await ownerMemberId(o), role: "admin", permissions: [] } };
    const id = await newCustomer(ctx, o, "Antes");
    await query("update subscriptions set status = 'canceled' where organization_id = $1", [o.orgId]);
    expect((await customers.getCustomer(ctx, id))?.firstName).toBe("Antes");
    await expect(customers.createCustomer(ctx, customerInput(o, "Después"))).rejects.toMatchObject({ code: "permission_denied" });
    await expect(customers.updateCustomer(ctx, { ...customerInput(o, "Cambio"), id, source: "manual" })).rejects.toMatchObject({ code: "permission_denied" });
  });
});
