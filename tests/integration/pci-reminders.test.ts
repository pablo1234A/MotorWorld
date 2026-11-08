import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool } from "@/server/db/client";
import type { EmailPort, OutboundEmail, SendResult } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { runDispatcher } from "@/server/reminders/dispatcher";

import { createOrg, query, type TestOrg } from "./support/db";

/**
 * PCI · casos 12 y 13: se detectan los vencimientos de una instalación y se
 * envía UN aviso (sin duplicados); si la actuación se registra antes, el aviso
 * pendiente se cancela. Proveedor de prueba SOLO en tests (no sale ningún correo).
 */
class FakeEmail implements EmailPort {
  readonly name = "smtp" as const;
  sent: OutboundEmail[] = [];
  async send(e: OutboundEmail): Promise<SendResult> {
    this.sent.push(e);
    return { kind: "accepted", messageId: randomUUID() };
  }
}

const LINK_SECRET = "test-link-secret-0123456789abcdef0123456789";
process.env.EMAIL_LINK_SECRET = LINK_SECRET;
const sender: SenderConfig = {
  sharedDomain: "avisos.revisaya.test",
  appUrl: "http://localhost:3000",
  linkSecret: LINK_SECRET,
};

async function setup(): Promise<
  TestOrg & {
    installationId: string;
    customerId: string;
    equipmentId: string;
    annualId: string;
  }
> {
  const org = await createOrg("pro");
  await query(
    `update branch_settings set reminders_enabled = true, offsets_days = '{30,7}', send_window_start = '00:00', send_window_end = '23:59:59',
            send_weekdays = '{1,2,3,4,5,6,7}', reply_to_email = 'oficina@pci.test' where branch_id = $1`,
    [org.branchId],
  );
  await query(
    "update organizations set trade_name = 'Extintores Norte' where id = $1",
    [org.orgId],
  );
  const [{ id: customerId }] = await query<{ id: string }>(
    "insert into customers (organization_id, branch_id, first_name, email, customer_kind, contact_name) values ($1, $2, 'Comunidad Encinas', $3, 'company', 'Marta Gil') returning id",
    [org.orgId, org.branchId, `c-${randomUUID().slice(0, 8)}@cliente.test`],
  );
  const [{ id: installationId }] = await query<{ id: string }>(
    "insert into installations (organization_id, branch_id, customer_id, name, address_line1, city) values ($1, $2, $3, 'Garaje comunitario', 'Calle Encina 12', 'Madrid') returning id",
    [org.orgId, org.branchId, customerId],
  );
  // Extintor puesto en servicio hace 340 días: el mantenimiento anual vence dentro de ~25 días.
  const [{ id: equipmentId }] = await query<{ id: string }>(
    "insert into equipment (organization_id, branch_id, installation_id, category_code, code, location) values ($1, $2, $3, 'extinguisher', '', 'Planta -1') returning id",
    [org.orgId, org.branchId, installationId],
  );
  await query(
    "insert into equipment_extinguishers (equipment_id, organization_id, branch_id, agent, put_in_service_on) values ($1, $2, $3, 'powder_abc', current_date - 340)",
    [equipmentId, org.orgId, org.branchId],
  );
  const [{ id: annualId }] = await query<{ id: string }>(
    "select id from maintenance_action_types where code = 'ext_annual' and organization_id is null",
  );
  return { ...org, installationId, customerId, equipmentId, annualId };
}

const planNow = () =>
  query<{ s: Record<string, number> }>(
    "select private.plan_reminders(now()) as s",
  );
const makeClaimable = (installationId: string) =>
  query(
    "update reminders set scheduled_for = now() - interval '1 minute' where installation_id = $1 and status = 'scheduled'",
    [installationId],
  );

beforeEach(async () => {
  await query(
    "update reminders set status = 'canceled', skip_reason = 'canceled_by_user' where status in ('scheduled', 'retrying', 'processing')",
  );
});
afterAll(closePool);

describe("PCI: avisos de vencimiento por instalación", () => {
  it("planifica un aviso por instalación, lo envía una sola vez con los datos de la instalación y registra el correo", async () => {
    const t = await setup();
    const [{ due }] = await query<{ due: string }>(
      "select next_action_on::text as due from equipment where id = $1",
      [t.equipmentId],
    );
    await planNow();
    const planned = await query<{
      id: string;
      due_date: string;
      offset_days: number;
    }>(
      "select id, due_date::text, offset_days from reminders where installation_id = $1 and type = 'installation_due' and status = 'scheduled'",
      [t.installationId],
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].due_date).toBe(due);
    expect(planned[0].offset_days).toBe(30);

    await makeClaimable(t.installationId);
    const email = new FakeEmail();
    const stats = await runDispatcher({ email, sender });
    expect(stats.sent).toBeGreaterThanOrEqual(1);
    // La BD de pruebas es compartida: el planificador también avisa a otras empresas; aquí solo cuenta este cliente.
    const mine = email.sent.filter(
      (e) =>
        e.subject.includes("Garaje comunitario") &&
        e.tags?.organization_id === t.orgId,
    );
    expect(mine).toHaveLength(1);
    const msg = mine[0];
    expect(msg.subject).toContain("Garaje comunitario");
    expect(msg.text).toContain("1 extintor");
    expect(msg.text).toContain("Calle Encina 12, Madrid");
    expect(msg.text).toContain(due.split("-").reverse().join("/"));
    expect(msg.html).toContain(
      "se ocupa del mantenimiento de tus instalaciones de protección contra incendios",
    );
    expect(msg.html).not.toContain("vehículo");
    const [log] = await query<{ installation_id: string; kind: string }>(
      "select installation_id, kind from email_logs where reminder_id = $1",
      [planned[0].id],
    );
    expect(log).toEqual({
      installation_id: t.installationId,
      kind: "reminder",
    });

    // Sin duplicados: volver a planificar y despachar no envía otra vez el mismo aviso.
    await planNow();
    await makeClaimable(t.installationId);
    const again = new FakeEmail();
    await runDispatcher({ email: again, sender });
    expect(
      again.sent.filter(
        (e) => e.subject.includes("Garaje comunitario") && e.to === msg.to,
      ),
    ).toHaveLength(0);
    const [{ n }] = await query<{ n: string }>(
      "select count(*) as n from reminders where installation_id = $1 and offset_days = 30 and due_date = $2",
      [t.installationId, due],
    );
    expect(Number(n)).toBe(1);
  });

  it("si se registra la actuación antes de enviarlo, el aviso se cancela (vencimiento superado)", async () => {
    const t = await setup();
    await planNow();
    await makeClaimable(t.installationId);
    // La revisión anual se hace hoy: el siguiente vencimiento pasa a dentro de un año.
    await query(
      "insert into equipment_maintenance_records (organization_id, branch_id, equipment_id, installation_id, customer_id, action_type_id, performed_on, result) values ($1, $2, $3, $4, $5, $6, current_date, 'compliant')",
      [
        t.orgId,
        t.branchId,
        t.equipmentId,
        t.installationId,
        t.customerId,
        t.annualId,
      ],
    );
    const email = new FakeEmail();
    const stats = await runDispatcher({ email, sender });
    expect(
      email.sent.filter((e) => e.subject.includes("Garaje comunitario")),
    ).toHaveLength(0);
    expect(stats.canceled).toBeGreaterThanOrEqual(1);
    const [r] = await query<{ status: string; skip_reason: string }>(
      "select status, skip_reason from reminders where installation_id = $1 and type = 'installation_due' order by created_at limit 1",
      [t.installationId],
    );
    expect(r).toEqual({ status: "canceled", skip_reason: "superseded" });
  });

  it("una instalación inactiva no recibe avisos", async () => {
    const t = await setup();
    await planNow();
    await makeClaimable(t.installationId);
    await query("update installations set status = 'inactive' where id = $1", [
      t.installationId,
    ]);
    const email = new FakeEmail();
    await runDispatcher({ email, sender });
    expect(
      email.sent.filter((e) => e.subject.includes("Garaje comunitario")),
    ).toHaveLength(0);
    const [r] = await query<{ status: string; skip_reason: string }>(
      "select status, skip_reason from reminders where installation_id = $1",
      [t.installationId],
    );
    expect(r).toEqual({
      status: "canceled",
      skip_reason: "installation_inactive",
    });
  });
});
