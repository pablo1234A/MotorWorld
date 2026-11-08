import { randomUUID } from "node:crypto";

import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool } from "@/server/db/client";
import * as privacy from "@/server/modules/privacy/service";

import { addMember, createOrg, createUser, ownerMemberId, query, type TestOrg } from "./support/db";

/** Derechos de protección de datos: exportar un cliente, exportar el taller y supresión inmediata. */

type Ctx = Parameters<typeof privacy.exportCustomer>[0];
async function admin(o: TestOrg): Promise<Ctx> {
  return { auth: { userId: o.ownerId }, membership: { organizationId: o.orgId, memberId: await ownerMemberId(o), role: "admin", permissions: [], organizationName: "", organizationSlug: "", logoPath: null, isOwner: true, branchScope: "all" } };
}

let org: TestOrg;
let other: TestOrg;
let customerId: string;
let vehicleId: string;
const email = `rgpd-${randomUUID().slice(0, 6)}@cliente.test`;

beforeAll(async () => {
  org = await createOrg("max");
  other = await createOrg("pro");
  [{ id: customerId }] = await query<{ id: string }>("insert into customers (organization_id, branch_id, first_name, last_name, email) values ($1, $2, 'Elena', 'Sanz', $3) returning id", [org.orgId, org.branchId, email]);
  [{ id: vehicleId }] = await query<{ id: string }>(
    "insert into vehicles (organization_id, branch_id, customer_id, plate, make, model) values ($1, $2, $3, $4, 'Opel', 'Corsa') returning id",
    [org.orgId, org.branchId, customerId, `${String(Math.floor(1000 + Math.random() * 8999))} GHJ`],
  );
  await query("insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, km, work_performed) values ($1, $2, $3, current_date - 10, 40000, 'Frenos')", [org.orgId, org.branchId, vehicleId]);
  await query("insert into appointments (organization_id, branch_id, source, requester_name, requester_email, customer_id, vehicle_id) values ($1, $2, 'booking_page', 'Elena Sanz', $3, $4, $5)", [org.orgId, org.branchId, email, customerId, vehicleId]);
  await query(
    "insert into email_logs (organization_id, branch_id, kind, to_email, from_email, subject, provider, provider_message_id, status, customer_id, vehicle_id, sent_at) values ($1, $2, 'reminder', $3, 'x@avisos.test', 'Revisión de tu Corsa', 'resend', 'm_' || gen_random_uuid(), 'delivered', $4, $5, now())",
    [org.orgId, org.branchId, email, customerId, vehicleId],
  );
  await query("insert into email_suppressions (organization_id, email, reason) values ($1, $2, 'unsubscribe') on conflict do nothing", [org.orgId, email]);
});
afterAll(closePool);

describe("derechos de protección de datos", () => {
  it("exportar un cliente: todos sus datos y queda registrado", async () => {
    const data = (await privacy.exportCustomer(await admin(org), customerId)) as { customer: unknown; vehicles: unknown[]; maintenance_history: unknown[]; appointments: unknown[]; emails: unknown[] };
    expect(data.customer).toMatchObject({ first_name: "Elena", email });
    expect(data.vehicles).toHaveLength(1);
    expect(data.maintenance_history[0]).toMatchObject({ work_performed: "Frenos" });
    expect(data.appointments).toHaveLength(1);
    expect(data.emails[0]).toMatchObject({ subject: "Revisión de tu Corsa" });
    const [req] = await query<{ type: string }>("select type from data_subject_requests where organization_id = $1 order by created_at desc limit 1", [org.orgId]);
    expect(req.type).toBe("portability");
  });

  it("nadie de otro taller ni un operario puede exportar o borrar", async () => {
    const intruder = await admin(other);
    expect(await privacy.exportCustomer({ ...intruder, membership: { ...intruder.membership, organizationId: org.orgId } }, customerId)).toBeNull();
    await expect(privacy.eraseCustomer(intruder, customerId)).rejects.toMatchObject({ code: "not_found" });
    const user = await createUser();
    const memberId = await addMember(org, user, "operator", ["customers.delete"]);
    const op: Ctx = { auth: { userId: user }, membership: { ...(await admin(org)).membership, memberId, role: "operator", isOwner: false } };
    await expect(privacy.eraseCustomer(op, customerId)).rejects.toMatchObject({ code: "permission_denied" });
    // Aunque el contexto diga «admin», la BD no le deja.
    await expect(privacy.eraseCustomer({ ...op, membership: { ...op.membership, role: "admin" } }, customerId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("exportar el taller: un Excel con todas las hojas", async () => {
    const file = await privacy.exportWorkshop(await admin(org));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Clientes", "Instalaciones", "Equipos", "Actuaciones", "Órdenes de trabajo", "Incidencias", "Técnicos", "Vehículos", "Historial", "Visitas", "Presupuestos"]);
    const clientes = wb.getWorksheet("Clientes")!;
    const nameCol = (clientes.getRow(1).values as unknown[]).indexOf("Nombre");
    expect(clientes.getRow(2).getCell(nameCol).value).toBe("Elena");
  });

  it("supresión inmediata: borra ficha, vehículos, historial y citas; anonimiza los correos; mantiene la baja", async () => {
    const counts = await privacy.eraseCustomer(await admin(org), customerId);
    expect(counts).toMatchObject({ vehicles: 1, maintenance_records: 1, appointments: 1, email_logs_anonymized: 1 });
    expect(await query("select 1 from customers where id = $1", [customerId])).toHaveLength(0);
    expect(await query("select 1 from vehicles where id = $1", [vehicleId])).toHaveLength(0);
    expect(await query("select 1 from email_logs where to_email = $1", [email])).toHaveLength(0);
    expect(await query("select 1 from email_suppressions where organization_id = $1 and email = $2", [org.orgId, email])).toHaveLength(1);
    const [audit] = await query<{ metadata: Record<string, number> }>("select metadata from audit_logs where action = 'customer.erased' and resource_id = $1", [customerId]);
    expect(audit.metadata.vehicles).toBe(1);
    expect(JSON.stringify(audit.metadata)).not.toContain(email);
  });

  it("purga de registros a los 24 meses", async () => {
    await query("insert into audit_logs (organization_id, actor_type, action, resource_type, created_at) values ($1, 'system', 'test.old', 'test', now() - interval '25 months')", [org.orgId]);
    const [{ r }] = await query<{ r: { audit_logs: number } }>("select private.purge_old_logs() as r");
    expect(r.audit_logs).toBeGreaterThanOrEqual(1);
    expect(await query("select 1 from audit_logs where action = 'test.old'")).toHaveLength(0);
  });
});
