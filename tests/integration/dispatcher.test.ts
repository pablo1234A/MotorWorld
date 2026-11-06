import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool } from "@/server/db/client";
import { unsubscribeToken } from "@/server/email/links";
import type { EmailPort, OutboundEmail, SendResult } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { SmtpEmailAdapter } from "@/server/email/smtp";
import { unsubscribe } from "@/server/modules/unsubscribe/service";
import { runDispatcher } from "@/server/reminders/dispatcher";

import { createOrg, query, type TestOrg } from "./support/db";

/**
 * CASOS CRÍTICOS 3 y 6: no se duplican envíos; un fallo de correo no detiene
 * los demás. Proveedor de prueba SOLO en tests (en la aplicación, sin
 * proveedor configurado no se envía nada).
 */
class FakeEmail implements EmailPort {
  readonly name = "smtp" as const;
  sent: OutboundEmail[] = [];
  constructor(private behavior: (e: OutboundEmail) => SendResult | Promise<SendResult> = () => ({ kind: "accepted", messageId: randomUUID() })) {}
  async send(e: OutboundEmail): Promise<SendResult> {
    const r = await this.behavior(e);
    if (r.kind === "accepted") this.sent.push(e);
    return r;
  }
}

const LINK_SECRET = "test-link-secret-0123456789abcdef0123456789";
process.env.EMAIL_LINK_SECRET = LINK_SECRET;
const sender: SenderConfig = { sharedDomain: "avisos.revisaya.test", appUrl: "http://localhost:3000", linkSecret: LINK_SECRET };

async function readyOrg(plan = "pro"): Promise<TestOrg> {
  const org = await createOrg(plan);
  // Ventana abierta todo el día y todos los días: el test no depende de la hora a la que se ejecute.
  await query(
    `update branch_settings set reminders_enabled = true, send_window_start = '00:00', send_window_end = '23:59:59',
            send_weekdays = '{1,2,3,4,5,6,7}', reply_to_email = 'taller@taller.test' where branch_id = $1`,
    [org.branchId],
  );
  await query("update organizations set trade_name = 'Taller Sur', brand_primary = '#0a7a5c' where id = $1", [org.orgId]);
  return org;
}

async function reminderFor(org: TestOrg, opts: { email?: string | null; name?: string; due?: string } = {}) {
  const [{ id: customerId }] = await query<{ id: string }>(
    "insert into customers (organization_id, branch_id, first_name, email) values ($1, $2, $3, $4) returning id",
    [org.orgId, org.branchId, opts.name ?? "Laura", opts.email === undefined ? `c-${randomUUID().slice(0, 8)}@cliente.test` : opts.email],
  );
  const digits = String(Math.floor(1000 + Math.random() * 8999));
  const [{ id: vehicleId }] = await query<{ id: string }>(
    "insert into vehicles (organization_id, branch_id, customer_id, plate, make, model, next_service_date, next_service_source) values ($1, $2, $3, $4, 'Seat', 'Ibiza', $5, 'manual') returning id",
    [org.orgId, org.branchId, customerId, `${digits} BCD`, opts.due ?? "2027-03-15"],
  );
  const [{ id }] = await query<{ id: string }>(
    `insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
     values ($1, $2, $3, $4, 'service_date', $5, 30, now() - interval '1 minute') returning id`,
    [org.orgId, org.branchId, customerId, vehicleId, opts.due ?? "2027-03-15"],
  );
  return { id, customerId, vehicleId };
}

async function reminder(id: string) {
  const [r] = await query<{ status: string; skip_reason: string | null; attempts: number; provider_message_id: string | null; next_attempt_at: Date | null; scheduled_for: Date }>(
    "select status, skip_reason, attempts, provider_message_id, next_attempt_at, scheduled_for from reminders where id = $1",
    [id],
  );
  return r;
}

async function emailsUsed(orgId: string): Promise<number> {
  const rows = await query<{ used: number }>("select used from usage_counters where organization_id = $1 and resource = 'emails'", [orgId]);
  return rows[0]?.used ?? 0;
}

beforeEach(async () => {
  // Aísla cada test: nada pendiente de otros tests queda reclamable.
  await query("update reminders set status = 'canceled', skip_reason = 'canceled_by_user' where status in ('scheduled', 'retrying', 'processing')");
});
afterAll(closePool);

describe("dispatcher de recordatorios", () => {
  it("envía, registra el correo, cuenta el consumo y marca como enviado solo con confirmación del proveedor", async () => {
    const org = await readyOrg();
    const r = await reminderFor(org, { name: "<script>alert(1)</script>" });
    const email = new FakeEmail();
    const stats = await runDispatcher({ email, sender });

    expect(stats).toMatchObject({ sent: 1, failed: 0 });
    expect(await reminder(r.id)).toMatchObject({ status: "sent", attempts: 1 });
    const [log] = await query<{ status: string; provider_message_id: string; subject: string }>(
      "select status, provider_message_id, subject from email_logs where reminder_id = $1",
      [r.id],
    );
    expect(log).toMatchObject({ status: "accepted", subject: "Revisión de tu Seat Ibiza en Taller Sur" });
    expect(await emailsUsed(org.orgId)).toBe(1);

    const sent = email.sent[0];
    expect(sent.idempotencyKey).toBe(`reminder-${r.id}`);
    expect(sent.from).toBe(`"Taller Sur" <${(await query<{ slug: string }>("select slug from organizations where id = $1", [org.orgId]))[0].slug}@avisos.revisaya.test>`);
    expect(sent.replyTo).toBe("taller@taller.test");
    expect(sent.html).not.toContain("<script>");
    expect(sent.html).toContain("&lt;script&gt;");
    expect(sent.html).toContain("15/03/2027");
    expect(sent.headers?.["List-Unsubscribe"]).toMatch(/^<http:\/\/localhost:3000\/api\/public\/unsubscribe\/.+>$/);
    expect(sent.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent.text).toContain("Para no recibir más avisos: http://localhost:3000/baja/");
  });

  it("un error temporal reintenta con backoff y libera la cuota; uno definitivo queda como fallido", async () => {
    const org = await readyOrg();
    const temp = await reminderFor(org);
    await runDispatcher({ email: new FakeEmail(() => ({ kind: "retryable", code: "resend_429", message: "rate limit" })), sender });
    const t = await reminder(temp.id);
    expect(t).toMatchObject({ status: "retrying", attempts: 1 });
    expect(t.next_attempt_at!.getTime()).toBeGreaterThan(Date.now() + 30_000);
    expect(await emailsUsed(org.orgId)).toBe(0);

    const perm = await reminderFor(org);
    await runDispatcher({ email: new FakeEmail(() => ({ kind: "permanent", code: "resend_422", message: "invalid to" })), sender });
    expect(await reminder(perm.id)).toMatchObject({ status: "failed" });
    const [log] = await query<{ status: string; error_code: string }>("select status, error_code from email_logs where reminder_id = $1", [perm.id]);
    expect(log).toMatchObject({ status: "failed", error_code: "resend_422" });
    expect(await emailsUsed(org.orgId)).toBe(0);
  });

  it("el fallo de un taller no detiene los envíos de otro", async () => {
    const a = await readyOrg();
    const b = await readyOrg();
    const ra = await reminderFor(a);
    const rb = await reminderFor(b);
    const email = new FakeEmail((e) => {
      if (e.tags?.organization_id === a.orgId) throw new Error("fallo inesperado del adaptador");
      return { kind: "accepted", messageId: randomUUID() };
    });
    await runDispatcher({ email, sender });
    expect((await reminder(rb.id)).status).toBe("sent");
    expect((await reminder(ra.id)).status).toBe("retrying");
  });

  it("límite mensual de correos: no envía y lo deja registrado", async () => {
    const org = await readyOrg("pro");
    await query("insert into usage_counters (organization_id, resource, period_start, used, limit_snapshot) values ($1, 'emails', app.usage_period($1), 500, 500)", [org.orgId]);
    const r = await reminderFor(org);
    const email = new FakeEmail();
    await runDispatcher({ email, sender });
    expect(await reminder(r.id)).toMatchObject({ status: "skipped", skip_reason: "quota_exceeded" });
    expect(email.sent).toHaveLength(0);
  });

  it("revalida antes de enviar: sin correo, baja, supresión, fecha cambiada, suscripción inactiva", async () => {
    const org = await readyOrg();
    const noEmail = await reminderFor(org, { email: null });
    const optedOut = await reminderFor(org);
    await query("update customers set reminders_opt_out = true where id = $1", [optedOut.customerId]);
    const suppressed = await reminderFor(org, { email: "rebota@cliente.test" });
    await query("insert into email_suppressions (organization_id, email, reason) values ($1, 'rebota@cliente.test', 'hard_bounce')", [org.orgId]);
    const moved = await reminderFor(org);
    await query("update vehicles set next_service_date = '2027-04-01' where id = $1", [moved.vehicleId]);
    const email = new FakeEmail();
    await runDispatcher({ email, sender });
    expect(await reminder(noEmail.id)).toMatchObject({ status: "skipped", skip_reason: "no_email" });
    expect(await reminder(optedOut.id)).toMatchObject({ status: "skipped", skip_reason: "opted_out" });
    expect(await reminder(suppressed.id)).toMatchObject({ status: "skipped", skip_reason: "suppressed" });
    expect(await reminder(moved.id)).toMatchObject({ status: "canceled", skip_reason: "superseded" });
    expect(email.sent).toHaveLength(0);

    const inactive = await readyOrg();
    const r = await reminderFor(inactive);
    await query("update subscriptions set status = 'canceled' where organization_id = $1", [inactive.orgId]);
    await runDispatcher({ email, sender });
    expect(await reminder(r.id)).toMatchObject({ status: "skipped", skip_reason: "subscription_inactive" });
  });

  it("fuera del horario de envío se reprograma sin gastar intentos", async () => {
    const org = await readyOrg();
    const r = await reminderFor(org);
    // Ventana que nunca incluye "ahora": solo los domingos, y hoy se marca festivo.
    await query("update branch_settings set send_weekdays = '{7}' where branch_id = $1", [org.branchId]);
    await query(
      "insert into blackout_dates (branch_id, organization_id, day) values ($1, $2, (now() at time zone 'Europe/Madrid')::date) on conflict do nothing",
      [org.branchId, org.orgId],
    );
    const email = new FakeEmail();
    const stats = await runDispatcher({ email, sender });
    expect(stats.rescheduled).toBeGreaterThanOrEqual(1);
    const after = await reminder(r.id);
    expect(after).toMatchObject({ status: "scheduled", attempts: 0 });
    expect(after.scheduled_for.getTime()).toBeGreaterThan(Date.now());
    expect(email.sent).toHaveLength(0);
  });

  it("recuperación tras una caída: si ya se había enviado, se marca como enviado sin reenviar", async () => {
    const org = await readyOrg();
    const r = await reminderFor(org);
    // Simula un proceso que envió, registró el correo y murió antes de marcar el recordatorio.
    await query("update reminders set status = 'processing', attempts = 1, locked_until = now() - interval '1 minute', locked_by = 'muerto' where id = $1", [r.id]);
    await query(
      `insert into email_logs (organization_id, branch_id, reminder_id, customer_id, vehicle_id, kind, to_email, from_email, subject, provider, provider_message_id, status, sent_at)
       values ($1, $2, $3, $4, $5, 'reminder', 'x@cliente.test', 'a@b.test', 's', 'smtp', $6, 'accepted', now())`,
      [org.orgId, org.branchId, r.id, r.customerId, r.vehicleId, `previo-${r.id}`],
    );
    await query("select private.release_expired_reminder_leases()");
    const email = new FakeEmail();
    const stats = await runDispatcher({ email, sender });
    expect(stats.recovered).toBe(1);
    expect(email.sent).toHaveLength(0);
    expect(await reminder(r.id)).toMatchObject({ status: "sent", provider_message_id: `previo-${r.id}` });
  });

  it("dos dispatchers simultáneos no envían ningún recordatorio dos veces", async () => {
    const org = await readyOrg("business");
    const ids = await Promise.all(Array.from({ length: 30 }, () => reminderFor(org).then((r) => r.id)));
    const counts = new Map<string, number>();
    const behave = async (e: OutboundEmail): Promise<SendResult> => {
      counts.set(e.idempotencyKey, (counts.get(e.idempotencyKey) ?? 0) + 1);
      await new Promise((res) => setTimeout(res, 5));
      return { kind: "accepted", messageId: randomUUID() };
    };
    const [s1, s2] = await Promise.all([
      runDispatcher({ email: new FakeEmail(behave), sender, batchSize: 7, perOrg: 7 }),
      runDispatcher({ email: new FakeEmail(behave), sender, batchSize: 7, perOrg: 7 }),
    ]);
    expect(s1.sent + s2.sent).toBe(30);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    expect(counts.size).toBe(30);
    const [{ n }] = await query<{ n: string }>("select count(*) as n from reminders where id = any($1::uuid[]) and status = 'sent'", [ids]);
    expect(Number(n)).toBe(30);
  });

  it("si el proveedor está caído, corta el lote sin quemar los intentos de todos", async () => {
    const org = await readyOrg("business");
    for (let i = 0; i < 12; i++) await reminderFor(org);
    const stats = await runDispatcher({
      email: new FakeEmail(() => ({ kind: "retryable", code: "network_error", message: "ECONNREFUSED" })),
      sender,
      batchSize: 5,
      perOrg: 5,
    });
    expect(stats.stopped).toBe("circuit_breaker");
    expect(stats.claimed).toBe(5);
    const [{ n }] = await query<{ n: string }>("select count(*) as n from reminders where organization_id = $1 and status = 'scheduled'", [org.orgId]);
    expect(Number(n)).toBe(7);
  });

  it("sin proveedor configurado no envía ni simula: los recordatorios siguen programados", async () => {
    const org = await readyOrg();
    const r = await reminderFor(org);
    const stats = await runDispatcher({ email: null, sender });
    expect(stats).toMatchObject({ stopped: "provider_not_configured", claimed: 0 });
    expect((await reminder(r.id)).status).toBe("scheduled");
    const [run] = await query<{ status: string }>("select status from private.job_runs where job_name = 'dispatch_reminders' order by id desc limit 1");
    expect(run.status).toBe("partial");
  });

  it("baja desde el enlace: el cliente deja de recibir avisos y su correo pasa a la lista de supresión", async () => {
    const org = await readyOrg();
    const r = await reminderFor(org, { email: "baja@cliente.test" });
    const token = unsubscribeToken(r.customerId, LINK_SECRET);
    expect(await unsubscribe(`${r.customerId}.firmafalsa0000000000000000000000`)).toBeNull();
    expect(await unsubscribe(token)).toMatchObject({ customerId: r.customerId, workshopName: "Taller Sur" });
    expect(await unsubscribe(token)).toMatchObject({ alreadyOptedOut: true }); // idempotente
    const [c] = await query<{ reminders_opt_out: boolean }>("select reminders_opt_out from customers where id = $1", [r.customerId]);
    expect(c.reminders_opt_out).toBe(true);
    const [s] = await query<{ reason: string }>("select reason from email_suppressions where organization_id = $1 and email = 'baja@cliente.test'", [org.orgId]);
    expect(s.reason).toBe("unsubscribe");
    expect(await reminder(r.id)).toMatchObject({ status: "skipped", skip_reason: "opted_out" });
  });
});

describe("envío real por SMTP (Mailpit local)", () => {
  const ip = (() => {
    try {
      return execSync("docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' supabase_inbucket_revisaya", { encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  })();

  it.skipIf(!ip)("el correo llega de verdad al servidor SMTP con asunto, remitente y cabeceras de baja", async () => {
    const org = await readyOrg();
    const to = `smtp-${randomUUID().slice(0, 8)}@cliente.test`;
    await reminderFor(org, { email: to });
    const stats = await runDispatcher({ email: new SmtpEmailAdapter(`smtp://${ip}:1025`), sender });
    expect(stats.sent).toBe(1);
    const search = (await (await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()) as {
      messages: Array<{ ID: string; Subject: string; From: { Name: string } }>;
    };
    expect(search.messages[0]).toMatchObject({ Subject: "Revisión de tu Seat Ibiza en Taller Sur", From: { Name: "Taller Sur" } });
    const headers = (await (await fetch(`http://127.0.0.1:54324/api/v1/message/${search.messages[0].ID}/headers`)).json()) as Record<string, string[]>;
    expect(headers["List-Unsubscribe-Post"]?.[0]).toBe("List-Unsubscribe=One-Click");
  });
});
