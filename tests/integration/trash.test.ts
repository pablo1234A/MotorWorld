import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool } from "@/server/db/client";
import type { ServiceCtx } from "@/server/modules/branches/service";
import * as customers from "@/server/modules/customers/service";
import * as trash from "@/server/modules/trash/service";
import * as vehicles from "@/server/modules/vehicles/service";

import { addMember, createCustomers, createOrg, createUser, ownerMemberId, query, type TestOrg } from "./support/db";

let org: TestOrg;
let admin: ServiceCtx;

async function customerWithVehicle(name: string, plate: string) {
  const r = await customers.createCustomer(admin, {
    branchId: org.branchId, firstName: name, lastName: "", email: null, phone: null, source: "manual", notes: null, remindersOptOut: false, confirmDuplicate: true,
  });
  if (r.kind !== "created") throw new Error("no creado");
  const v = await vehicles.createVehicle(admin, { customerId: r.id, plate, make: null, model: null, vin: null, currentKm: null, lastServiceDate: null, lastServiceKm: null, nextServiceDate: null });
  return { customerId: r.id, vehicleId: v };
}

beforeAll(async () => {
  org = await createOrg("business");
  admin = { auth: { userId: org.ownerId }, membership: { organizationId: org.orgId, memberId: await ownerMemberId(org), role: "admin", permissions: [] } };
});
afterAll(closePool);

describe("papelera", () => {
  it("restaurar un cliente recupera los vehículos que se borraron con él", async () => {
    const { customerId, vehicleId } = await customerWithVehicle("Restaurable", "6001RRR");
    await customers.deleteCustomer(admin, customerId, true);
    const listed = await trash.listTrash(admin);
    expect(listed.customers.find((c) => c.id === customerId)?.vehicles).toBe(1);

    await expect(trash.restoreCustomer(admin, customerId)).resolves.toEqual({ vehicles: 1 });
    expect(await customers.getCustomer(admin, customerId)).not.toBeNull();
    expect((await vehicles.getVehicle(admin, vehicleId))?.plate).toBe("6001RRR");
    await expect(trash.restoreCustomer(admin, customerId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("un vehículo borrado aparte se restaura solo; no si su propietario está borrado", async () => {
    const { customerId, vehicleId } = await customerWithVehicle("Dueño", "6002RRR");
    await vehicles.deleteVehicle(admin, vehicleId);
    expect((await trash.listTrash(admin)).vehicles.map((v) => v.id)).toContain(vehicleId);
    await trash.restoreVehicle(admin, vehicleId);
    expect(await vehicles.getVehicle(admin, vehicleId)).not.toBeNull();

    await customers.deleteCustomer(admin, customerId, true);
    await expect(trash.restoreVehicle(admin, vehicleId)).rejects.toMatchObject({ code: "integrity_violation", detail: "customer_deleted" });
  });

  it("si la matrícula se ha vuelto a usar, la restauración falla entera y no deja nada a medias", async () => {
    const { customerId } = await customerWithVehicle("Matrícula", "6003RRR");
    await customers.deleteCustomer(admin, customerId, true);
    await customerWithVehicle("Nuevo dueño", "6003 RRR");
    await expect(trash.restoreCustomer(admin, customerId)).rejects.toMatchObject({ code: "conflict", detail: "vehicles_plate_unique" });
    expect(await customers.getCustomer(admin, customerId)).toBeNull();
  });

  it("la restauración respeta el límite del plan", async () => {
    const pro = await createOrg("pro");
    const proAdmin: ServiceCtx = { auth: { userId: pro.ownerId }, membership: { organizationId: pro.orgId, memberId: await ownerMemberId(pro), role: "admin", permissions: [] } };
    await createCustomers(pro, 150);
    const [{ id }] = await query<{ id: string }>("select id from customers where organization_id = $1 limit 1", [pro.orgId]);
    await customers.deleteCustomer(proAdmin, id, false);
    await createCustomers(pro, 1);
    await expect(trash.restoreCustomer(proAdmin, id)).rejects.toMatchObject({ code: "plan_limit_reached", detail: "customers" });
  });

  it("restaurar exige permiso de borrado y no alcanza a otro taller", async () => {
    const { customerId } = await customerWithVehicle("Permiso", "6004RRR");
    await customers.deleteCustomer(admin, customerId, true);
    const user = await createUser();
    const memberId = await addMember(org, user, "operator", ["customers.write", "customers.delete"]);
    const op: ServiceCtx = { auth: { userId: user }, membership: { organizationId: org.orgId, memberId, role: "operator", permissions: ["customers.write", "customers.delete"] } };
    // Sin vehicles.delete no puede restaurar el vehículo: se revierte todo.
    await expect(trash.restoreCustomer(op, customerId)).rejects.toMatchObject({ code: "permission_denied" });
    expect(await customers.getCustomer(admin, customerId)).toBeNull();

    const other = await createOrg("max");
    const otherAdmin: ServiceCtx = { auth: { userId: other.ownerId }, membership: { organizationId: other.orgId, memberId: await ownerMemberId(other), role: "admin", permissions: [] } };
    expect((await trash.listTrash(otherAdmin)).customers).toHaveLength(0);
    await expect(trash.restoreCustomer(otherAdmin, customerId)).rejects.toMatchObject({ code: "not_found" });
  });
});
