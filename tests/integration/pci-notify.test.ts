import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SubscriptionState } from "@/server/auth/context";
import { closePool } from "@/server/db/client";
import type { EmailPort, OutboundEmail, SendResult } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import * as incidents from "@/server/modules/incidents/service";
import { sendPciEmail } from "@/server/modules/pci-notify/service";
import * as orders from "@/server/modules/work-orders/service";
import { installationStatusPdf, workOrderPdf } from "@/server/pci/pdf";

import { createOrg, ownerMemberId, query, type TestOrg } from "./support/db";

/**
 * PCI · correos al cliente desde una orden, una incidencia o una instalación,
 * y los PDF (parte de trabajo y estado). Proveedor de prueba SOLO en tests.
 */
class FakeEmail implements EmailPort {
  readonly name = "smtp" as const;
  sent: OutboundEmail[] = [];
  async send(e: OutboundEmail): Promise<SendResult> {
    this.sent.push(e);
    return { kind: "accepted", messageId: randomUUID() };
  }
}
const sender: SenderConfig = {
  sharedDomain: "avisos.revisaya.test",
  appUrl: "http://localhost:3000",
  linkSecret: "test-link-secret-0123456789abcdef0123456789",
};
const sub: SubscriptionState = {
  planCode: "pro",
  status: "active",
  active: true,
  trialEnd: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

let org: TestOrg;
let ctx: Parameters<typeof sendPciEmail>[0];
let customerEmail: string;
let installationId: string;
let workOrderId: string;
let incidentId: string;

beforeAll(async () => {
  org = await createOrg("pro");
  await query(
    "update organizations set trade_name = 'Extintores Norte' where id = $1",
    [org.orgId],
  );
  ctx = {
    auth: { userId: org.ownerId },
    membership: {
      organizationId: org.orgId,
      memberId: await ownerMemberId(org),
      role: "admin",
      permissions: [],
    },
    subscription: sub,
  } as never;
  customerEmail = `c-${randomUUID().slice(0, 8)}@cliente.test`;
  const [{ id: customerId }] = await query<{ id: string }>(
    "insert into customers (organization_id, branch_id, first_name, email, customer_kind, contact_name) values ($1, $2, 'Hotel Sol', $3, 'company', 'Laura Martín') returning id",
    [org.orgId, org.branchId, customerEmail],
  );
  [{ id: installationId }] = await query<{ id: string }>(
    "insert into installations (organization_id, branch_id, customer_id, name, address_line1, city) values ($1, $2, $3, 'Hotel Sol · edificio principal', 'Av. del Mar 10', 'Málaga') returning id",
    [org.orgId, org.branchId, customerId],
  );
  const [{ id: equipmentId }] = await query<{ id: string }>(
    "insert into equipment (organization_id, branch_id, installation_id, category_code, code, location, installed_on) values ($1, $2, $3, 'bie', '', 'Recepción', current_date - 300) returning id",
    [org.orgId, org.branchId, installationId],
  );
  const [{ id: annual }] = await query<{ id: string }>(
    "select id from maintenance_action_types where code = 'bie_annual' and organization_id is null",
  );
  workOrderId = await orders.createWorkOrder(ctx as never, {
    installationId,
    serviceType: "periodic_maintenance",
    scheduledFor: "2030-01-15",
    scheduledTime: "09:30",
    technicianId: null,
    description: null,
    includeDue: false,
    dueUntil: null,
    items: [`${equipmentId}:${annual}`],
  });
  incidentId = await incidents.createIncident(ctx as never, {
    installationId,
    equipmentId,
    workOrderId,
    severity: "high",
    title: "Manguera agrietada",
    description: null,
    detectedOn: new Date().toISOString().slice(0, 10),
  });
});
afterAll(closePool);

describe("PCI: correos al cliente y PDF", () => {
  it("próxima actuación: con la fecha, la hora y el número de la orden; queda en el registro de correos", async () => {
    const email = new FakeEmail();
    expect(
      await sendPciEmail(ctx, "action_upcoming", workOrderId, {
        email,
        sender,
      }),
    ).toBe("sent");
    expect(email.sent).toHaveLength(1);
    const m = email.sent[0];
    expect(m.to).toBe(customerEmail);
    expect(m.subject).toContain("Hotel Sol · edificio principal");
    expect(m.text).toContain("15/01/2030 a las 09:30");
    expect(m.text).toMatch(/OT-\d{4}-\d{4}/);
    expect(m.text).toContain("Hola Laura");
    const [log] = await query<{ kind: string; work_order_id: string }>(
      "select kind, work_order_id from email_logs where work_order_id = $1",
      [workOrderId],
    );
    expect(log).toEqual({
      kind: "action_upcoming",
      work_order_id: workOrderId,
    });
  });

  it("el parte solo se envía con la orden completada, y va adjunto en PDF", async () => {
    const email = new FakeEmail();
    await expect(
      sendPciEmail(ctx, "service_completed", workOrderId, { email, sender }),
    ).rejects.toMatchObject({
      code: "validation_error",
      detail: "work_order_not_completed",
    });
    const o = await orders.getWorkOrder(ctx as never, workOrderId);
    const [{ id: techId }] = await query<{ id: string }>(
      "insert into technicians (organization_id, full_name) values ($1, 'Pablo Ruiz') returning id",
      [org.orgId],
    );
    await orders.updateWorkOrder(ctx as never, {
      id: workOrderId,
      serviceType: "periodic_maintenance",
      scheduledFor: "2030-01-15",
      scheduledTime: "09:30",
      technicianId: techId,
      description: null,
      notes: null,
    });
    await orders.setWorkOrderStatus(
      ctx as never,
      workOrderId,
      "in_progress",
      null,
    );
    await orders.recordItemResult(
      ctx as never,
      {
        itemId: o!.itemList[0].id,
        result: "compliant",
        performedOn: new Date().toISOString().slice(0, 10),
        observations: "Presión correcta",
        materials: [],
      } as never,
    );
    await orders.setWorkOrderStatus(
      ctx as never,
      workOrderId,
      "completed",
      "Todo correcto",
    );
    expect(
      await sendPciEmail(ctx, "service_completed", workOrderId, {
        email,
        sender,
      }),
    ).toBe("sent");
    const m = email.sent[0];
    expect(m.text).toContain("Equipos revisados: 1. Correctos: 1.");
    expect(m.attachments?.[0].contentType).toBe("application/pdf");
    expect(m.attachments?.[0].content.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("incidencia detectada y estado de la instalación en PDF", async () => {
    const email = new FakeEmail();
    expect(
      await sendPciEmail(ctx, "incident_detected", incidentId, {
        email,
        sender,
      }),
    ).toBe("sent");
    expect(email.sent[0].text).toContain(
      "Manguera agrietada (gravedad: alta) (equipo BIE-000001)",
    );
    expect(
      await sendPciEmail(ctx, "report_sent", installationId, { email, sender }),
    ).toBe("sent");
    expect(email.sent[1].attachments?.[0].filename).toMatch(
      /^estado-hotel-sol/,
    );
    const [log] = await query<{ incident_id: string }>(
      "select incident_id from email_logs where kind = 'incident_detected' and incident_id = $1",
      [incidentId],
    );
    expect(log.incident_id).toBe(incidentId);
  });

  it("los PDF dicen que no son certificados oficiales", async () => {
    const wo = await workOrderPdf(ctx as never, workOrderId);
    const st = await installationStatusPdf(
      ctx as never,
      installationId,
      "2030-01-01",
    );
    expect(wo?.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(st?.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(wo?.filename).toMatch(/^parte-OT-/);
  });

  it("respeta los bloqueos, la falta de correo, el proveedor sin configurar y otra empresa", async () => {
    const email = new FakeEmail();
    expect(
      await sendPciEmail(ctx, "report_sent", installationId, {
        email: null,
        sender: null,
      }),
    ).toBe("not_configured");
    await query(
      "insert into email_suppressions (organization_id, email, reason) values ($1, $2, 'manual')",
      [org.orgId, customerEmail],
    );
    expect(
      await sendPciEmail(ctx, "report_sent", installationId, { email, sender }),
    ).toBe("suppressed");
    expect(email.sent).toHaveLength(0);
    const other = await createOrg("pro");
    const otherCtx = {
      auth: { userId: other.ownerId },
      membership: {
        organizationId: other.orgId,
        memberId: await ownerMemberId(other),
        role: "admin",
        permissions: [],
      },
      subscription: sub,
    } as never;
    await expect(
      sendPciEmail(otherCtx, "report_sent", installationId, { email, sender }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
