import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool } from "@/server/db/client";
import type { EmailPort, OutboundEmail, SendResult } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { checkEmailReputation, orgEmailReputation } from "@/server/modules/email/notifications";
import * as reports from "@/server/modules/reports/service";

import { createOrg, query, type TestOrg } from "./support/db";

/** Fase 11: reputación del correo (rebotes y quejas) con alertas a los administradores. */

class FakeEmail implements EmailPort {
  readonly name = "smtp" as const;
  sent: OutboundEmail[] = [];
  async send(e: OutboundEmail): Promise<SendResult> {
    this.sent.push(e);
    return { kind: "accepted", messageId: randomUUID() };
  }
}
const sender: SenderConfig = { sharedDomain: "avisos.revisaya.test", appUrl: "http://localhost:3000", linkSecret: "x".repeat(40) };

async function logs(o: TestOrg, n: number, status: string, kind = "reminder", bounceType: string | null = null) {
  await query(
    `insert into email_logs (organization_id, branch_id, kind, to_email, from_email, subject, provider, provider_message_id, status, bounce_type, sent_at)
     select $1, $2, $3, 'c' || i || '@cliente.test', 'taller@avisos.test', 'Aviso', 'resend', 'm_' || gen_random_uuid(), $4, $5, now()
       from generate_series(1, $6::int) i`,
    [o.orgId, o.branchId, kind, status, bounceType, n],
  );
}

let warn: TestOrg;
let critical: TestOrg;
let ok: TestOrg;

beforeAll(async () => {
  await query("delete from private.email_reputation_alerts");
  warn = await createOrg("pro");
  critical = await createOrg("pro");
  ok = await createOrg("pro");
  await logs(warn, 94, "delivered");
  await logs(warn, 6, "bounced", "reminder", "hard"); // 6 % de rebotes
  await logs(critical, 96, "delivered");
  await logs(critical, 4, "complained"); // 4 % de quejas
  await logs(ok, 98, "delivered");
  await logs(ok, 2, "bounced", "reminder", "soft"); // los temporales no cuentan
  await logs(ok, 30, "delivered", "welcome"); // correos al taller: no cuentan
});
afterAll(closePool);

describe("reputación del correo", () => {
  it("avisa a los administradores de los talleres por encima de los umbrales, una vez por semana", async () => {
    const email = new FakeEmail();
    const stats = await checkEmailReputation({ email, sender });
    expect(stats.warning).toBeGreaterThanOrEqual(1);
    expect(stats.critical).toBeGreaterThanOrEqual(1);
    const alerts = await query<{ organization_id: string; level: string }>("select organization_id, level from private.email_reputation_alerts");
    expect(alerts).toEqual(expect.arrayContaining([{ organization_id: warn.orgId, level: "warning" }, { organization_id: critical.orgId, level: "critical" }]));
    expect(alerts.some((a) => a.organization_id === ok.orgId)).toBe(false);
    expect(email.sent.some((m) => m.subject === "Problema con la entrega de tus correos")).toBe(true);
    expect(email.sent.some((m) => m.subject === "Revisa la calidad de tus correos")).toBe(true);

    const again = new FakeEmail();
    await checkEmailReputation({ email: again, sender });
    expect(again.sent).toHaveLength(0);
  });

  it("el panel muestra las tasas solo al administrador de ese taller", async () => {
    const [{ user_id }] = await query<{ user_id: string }>("select user_id from organization_members where organization_id = $1 and is_owner", [warn.orgId]);
    const r = await orgEmailReputation({ auth: { userId: user_id }, membership: { organizationId: warn.orgId } });
    expect(r).toMatchObject({ sent: 100, bounced: 6, level: "warning" });
    await expect(orgEmailReputation({ auth: { userId: user_id }, membership: { organizationId: critical.orgId } })).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("los informes no cuentan el correo de bienvenida como correo a clientes", async () => {
    await query("insert into subscriptions (organization_id, plan_code, status, billing_interval) values ($1, 'max', 'active', 'month') on conflict (organization_id) do update set plan_code = 'max'", [ok.orgId]);
    const [{ user_id }] = await query<{ user_id: string }>("select user_id from organization_members where organization_id = $1 and is_owner", [ok.orgId]);
    const s = await reports.getSummary(
      { auth: { userId: user_id }, membership: { organizationId: ok.orgId }, subscription: { planCode: "max", status: "active", active: true, trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false } },
      reports.parseRange({}),
    );
    expect(s.emailsTotal).toBe(100);
    expect(s.emailsByKind.welcome).toBeUndefined();
  });
});
