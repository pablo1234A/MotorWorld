import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, todayIn } from "@/lib/dates";
import type { OperatorPermission } from "@/lib/permissions";
import type { SubscriptionState } from "@/server/auth/context";
import { closePool } from "@/server/db/client";
import * as customers from "@/server/modules/customers/service";
import { getPciDashboard } from "@/server/modules/dashboard/service";
import * as documents from "@/server/modules/documents/service";
import * as equipment from "@/server/modules/equipment/service";
import * as incidents from "@/server/modules/incidents/service";
import * as installations from "@/server/modules/installations/service";
import * as records from "@/server/modules/maintenance/records";
import * as reports from "@/server/modules/reports/service";
import * as technicians from "@/server/modules/technicians/service";
import * as orders from "@/server/modules/work-orders/service";

import { addMember, createOrg, createUser, ownerMemberId, query, type TestOrg } from "./support/db";

/** Flujo PCI de punta a punta por los servicios reales, contra la BD real. */

type Ctx = Parameters<typeof installations.createInstallation>[0] & { subscription: SubscriptionState };
const sub: SubscriptionState = { planCode: "business", status: "active", active: true, trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };

async function admin(o: TestOrg): Promise<Ctx> {
  return { auth: { userId: o.ownerId }, membership: { organizationId: o.orgId, memberId: await ownerMemberId(o), role: "admin", permissions: [] }, subscription: sub };
}
async function operator(o: TestOrg, permissions: OperatorPermission[]): Promise<Ctx> {
  const user = await createUser();
  const memberId = await addMember(o, user, "operator", permissions);
  return { auth: { userId: user }, membership: { organizationId: o.orgId, memberId, role: "operator", permissions }, subscription: sub };
}
const extForm = {
  categoryCode: "extinguisher" as const, typeId: null, code: "", manufacturer: "Firex", model: "PI-6", serialNumber: "SN-001", location: "Recepción, junto a la salida",
  installedOn: "2024-03-01", manufacturedOn: "2024-01-10", notes: null, agent: null, chargeValue: 6, chargeUnit: "kg" as const, efficacy: "27A-183B-C",
  mobility: "portable" as const, stampedOn: "2024-01-15", putInServiceOn: "2024-03-01", retimbradosBefore: 0,
};

let org: TestOrg;
let other: TestOrg;
let ctx: Ctx;
let customerId: string;
let installationId: string;
let extId: string;
let bieId: string;

beforeAll(async () => {
  org = await createOrg("business");
  other = await createOrg("business");
  ctx = await admin(org);
});
afterAll(closePool);

describe("PCI: cliente → instalación → equipos → actuación → orden → historial", () => {
  it("crea un cliente empresa con CIF y su instalación", async () => {
    const r = await customers.createCustomer(ctx, {
      branchId: org.branchId, firstName: "Hotel Sol", lastName: "", email: "mantenimiento@hotelsol.test", phone: null, source: "manual", notes: null,
      remindersOptOut: false, confirmDuplicate: true, customerKind: "company", legalName: "Hoteles del Sol SL", taxId: "B12345674",
      addressLine1: "Av. del Mar 10", postalCode: "29001", city: "Málaga", province: "Málaga", contactName: "Laura Martín", contactRole: "Jefa de mantenimiento",
    });
    expect(r.kind).toBe("created");
    customerId = (r as { id: string }).id;
    const [c] = await query<{ customer_kind: string; tax_id: string }>("select customer_kind, tax_id from customers where id = $1", [customerId]);
    expect(c).toEqual({ customer_kind: "company", tax_id: "B12345674" });
    installationId = await installations.createInstallation(ctx, {
      customerId, name: "Hotel Sol · Edificio principal", establishmentType: "hospitality", addressLine1: "Av. del Mar 10", postalCode: "29001",
      city: "Málaga", province: "Málaga", contactName: "Laura Martín", contactPhone: "+34600111222", contactEmail: null, notes: null,
    });
    const page = await installations.listInstallations(ctx, { customerId, page: 1, pageSize: 25 });
    expect(page.rows.map((i) => i.id)).toEqual([installationId]);
  });

  it("crea un extintor (ficha específica) y una BIE; el agente sale del tipo si no se indica", async () => {
    const powder = (await equipment.catalog(ctx)).types.find((t) => t.code === "powder_abc")!;
    extId = await equipment.createEquipment(ctx, { ...extForm, typeId: powder.id, installationId });
    const ext = (await equipment.getEquipment(ctx, extId))!;
    expect(ext.code).toMatch(/^EXT-\d{6}$/);
    expect(ext.extinguisher).toMatchObject({ agent: "powder_abc", chargeValue: 6, efficacy: "27A-183B-C", retimbradoLimitOn: "2044-01-15" });
    expect(ext.schedules.map((s) => s.actionName)).toEqual(["Mantenimiento anual (UNE 23120)", "Retimbrado (prueba de nivel C)"]);
    bieId = await equipment.createEquipment(ctx, { ...extForm, categoryCode: "bie", code: "BIE-01", stampedOn: null, putInServiceOn: null, chargeValue: null, chargeUnit: null, efficacy: null, installationId });
    const bie = (await equipment.getEquipment(ctx, bieId))!;
    expect(bie.extinguisher).toBeNull();
    expect(bie.schedules.map((s) => s.actionName)).toEqual(["Inspección y mantenimiento anual (UNE-EN 671-3)", "Mantenimiento quinquenal de la manguera (UNE-EN 671-3)"]);
    const qr = await equipment.findEquipment(ctx, ext.qrToken);
    expect(qr?.id).toBe(extId);
    expect((await equipment.findEquipment(ctx, "bie-01"))?.id).toBe(bieId);
  });

  it("registra una actuación con materiales; la corrección exige motivo; recalcula el vencimiento", async () => {
    const annual = (await equipment.catalog(ctx)).actions.find((a) => a.code === "ext_annual")!;
    const id = await records.createRecord(ctx, {
      equipmentId: extId, actionTypeId: annual.id, performedOn: "2025-03-05", result: "compliant_with_remarks", observations: "Precinto sustituido",
      nextActionRecommendedOn: null, technicianId: null, workOrderId: null, materials: [{ description: "Precinto", reference: "PR-1", quantity: 1, unit: "ud" }],
      incidentTitle: null, incidentSeverity: "medium",
    });
    expect((await equipment.getEquipment(ctx, extId))!.nextActionOn).toBe("2026-03-05");
    await expect(query("update equipment_maintenance_records set result = 'compliant' where id = $1", [id])).rejects.toThrow("amendment_reason_required");
    await records.amendRecord(ctx, { id, result: "compliant", observations: "Precinto sustituido", nextActionRecommendedOn: null, amendmentReason: "Era conforme" });
    const hist = await records.listRecords(ctx, { equipmentId: extId, page: 1, pageSize: 10 });
    expect(hist.rows[0]).toMatchObject({ result: "compliant", amendmentReason: "Era conforme", materials: [{ description: "Precinto", quantity: 1 }] });
  });

  it("orden de trabajo con los equipos que vencen, técnico asignado, resultados por equipo y cierre", async () => {
    const tecCtx = await operator(org, ["work_orders.execute", "maintenance.write", "incidents.write"]);
    const tecId = await technicians.saveTechnician(ctx, { id: null, fullName: "Ana Técnica", phone: null, email: null, memberId: tecCtx.membership.memberId, qualificationNotes: null, active: true });
    const woId = await orders.createWorkOrder(ctx, {
      installationId, serviceType: "periodic_maintenance", scheduledFor: addDays(todayIn(), 2), scheduledTime: "09:30", technicianId: tecId,
      description: "Revisión anual", includeDue: true, dueUntil: addDays(todayIn(), 400), items: [],
    });
    let wo = (await orders.getWorkOrder(ctx, woId))!;
    expect(wo.status).toBe("assigned");
    expect(wo.number).toMatch(/^OT-\d{4}-\d{4}$/);
    expect(wo.itemList.length).toBeGreaterThanOrEqual(2);
    // El técnico ve su orden; un técnico distinto, no.
    expect((await orders.listWorkOrders(tecCtx, { status: "open", page: 1, pageSize: 10 })).rows.map((r) => r.id)).toEqual([woId]);
    const otherTec = await operator(org, ["work_orders.execute"]);
    expect((await orders.listWorkOrders(otherTec, { page: 1, pageSize: 10 })).total).toBe(0);
    expect(await orders.getWorkOrder(otherTec, woId)).toBeNull();
    // No puede completarse sin pasar por «en curso» ni con equipos pendientes.
    await expect(orders.setWorkOrderStatus(tecCtx, woId, "completed", null)).rejects.toMatchObject({ code: "validation_error" });
    await orders.setWorkOrderStatus(tecCtx, woId, "in_progress", null);
    await expect(orders.setWorkOrderStatus(tecCtx, woId, "completed", null)).rejects.toMatchObject({ code: "validation_error" });
    for (const item of wo.itemList) {
      await orders.recordItemResult(tecCtx, {
        itemId: item.id, result: item.equipmentId === bieId ? "non_compliant" : "compliant", performedOn: todayIn(),
        observations: item.equipmentId === bieId ? "Manguera agrietada" : null, nextActionRecommendedOn: null, materials: [],
        incidentTitle: item.equipmentId === bieId ? "Sustituir manguera de la BIE" : null, incidentSeverity: "high",
      });
    }
    await orders.setWorkOrderStatus(tecCtx, woId, "completed", "Revisión completada");
    wo = (await orders.getWorkOrder(ctx, woId))!;
    expect(wo.status).toBe("completed");
    expect(wo.itemList.every((i) => i.recordId)).toBe(true);
    expect(wo.events.map((e) => e.event)).toEqual(expect.arrayContaining(["created", "status_changed"]));
    // Historial del equipo con la orden; incidencia abierta desde la orden.
    const hist = await records.listRecords(ctx, { workOrderId: woId, page: 1, pageSize: 20 });
    expect(hist.rows.every((r) => r.workOrderNumber === wo.number && r.technicianName === "Ana Técnica")).toBe(true);
    const open = await incidents.listIncidents(ctx, { installationId, page: 1, pageSize: 10 });
    expect(open.rows[0]).toMatchObject({ title: "Sustituir manguera de la BIE", severity: "high", workOrderNumber: wo.number });
    await incidents.updateIncident(ctx, { id: open.rows[0].id, status: "resolved", severity: "high", resolution: "Manguera sustituida" });
    expect((await incidents.getIncident(ctx, open.rows[0].id))!.resolvedOn).toBe(todayIn());
  });

  it("inicio e informes con datos reales; aislamiento entre empresas", async () => {
    const d = await getPciDashboard(ctx);
    expect(d).toMatchObject({ customers: 1, installations: 1, equipment: 2, extinguishers: 1, incidentsOpen: 0 });
    expect(d.records30d).toBeGreaterThanOrEqual(2);
    const s = await reports.getPciSummary(ctx, reports.parseRange({}));
    expect(s.equipmentTotal).toBe(2);
    expect(s.workOrdersCompleted).toBe(1);
    expect(s.technicians[0]).toMatchObject({ name: "Ana Técnica", workOrders: 1 });
    const inst = await reports.pciReportRows(ctx, "instalaciones", reports.parseRange({}), addDays(todayIn(), 30), { page: 1 });
    expect(inst.rows[0]).toMatchObject({ installation: "Hotel Sol · Edificio principal", equipment: 2, extinguishers: 1 });
    const csv = await reports.pciExportRows(ctx, "mantenimientos", reports.parseRange({}), addDays(todayIn(), 30));
    expect(csv[0][0]).toBe("Fecha");

    const intruder = await admin(other);
    const fake = { ...intruder, membership: { ...intruder.membership, organizationId: org.orgId } };
    expect(await equipment.getEquipment(intruder, extId)).toBeNull();
    expect(await equipment.getEquipment(fake, extId)).toBeNull();
    expect((await installations.listInstallations(fake, { page: 1, pageSize: 10 })).total).toBe(0);
    await expect(equipment.createEquipment(intruder, { ...extForm, installationId })).rejects.toMatchObject({ code: "not_found" });
    await expect(reports.getPciSummary(fake, reports.parseRange({}))).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("documentos y fotos: privados, comprobados por contenido y descargables solo con permiso", async () => {
    const pdf = Buffer.from("%PDF-1.4\n% prueba\n");
    const id = await documents.uploadDocument(ctx, { owner: "installation", ownerId: installationId, title: "Certificado de instalación", bytes: pdf });
    expect((await documents.listDocuments(ctx, "installation", installationId)).map((d) => d.id)).toEqual([id]);
    await expect(documents.uploadDocument(ctx, { owner: "equipment", ownerId: extId, title: "x", bytes: Buffer.from("<script>alert(1)</script>") })).rejects.toMatchObject({ detail: "document_type" });
    expect(await documents.documentUrl(ctx, id)).toMatch(/^http/);
    expect(await documents.documentUrl(await admin(other), id)).toBeNull();
    await expect(documents.uploadDocument(await admin(other), { owner: "installation", ownerId: installationId, title: "x", bytes: pdf })).rejects.toMatchObject({ code: "not_found" });
  });

  it("borrado: no se borra una instalación con equipos activos; sin permiso, tampoco un equipo", async () => {
    await expect(installations.deleteInstallation(ctx, installationId)).rejects.toThrow();
    const readOnly = await operator(org, ["maintenance.write"]);
    await expect(equipment.deleteEquipment(readOnly, bieId)).rejects.toMatchObject({ code: "permission_denied" });
  });
});
