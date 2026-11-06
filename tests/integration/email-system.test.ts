import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { OperatorPermission } from "@/lib/permissions";
import type { PlanCode } from "@/lib/plans";
import type { SubscriptionState } from "@/server/auth/context";
import { closePool } from "@/server/db/client";
import type { DomainPort, DomainStatus, ProviderDomain } from "@/server/email/domains";
import type { EmailPort, OutboundEmail, SendResult } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { signWebhook } from "@/server/email/webhooks";
import * as domains from "@/server/modules/email/domains";
import { notifyUsage, sendDigests } from "@/server/modules/email/notifications";
import * as settings from "@/server/modules/email/settings";
import * as templates from "@/server/modules/email/templates";
import { runDispatcher } from "@/server/reminders/dispatcher";

import { addMember, createOrg, createUser, ownerMemberId, query, type TestOrg } from "./support/db";

/**
 * Fase 6 por el camino real (servicios + RLS + BD). Los puertos de correo y
 * de dominios de prueba existen SOLO aquí: en la aplicación, sin proveedor
 * configurado no se envía ni se verifica nada.
 */

class FakeEmail implements EmailPort {
  sent: OutboundEmail[] = [];
  constructor(
    private behavior: () => SendResult = () => ({ kind: "accepted", messageId: randomUUID() }),
    readonly name: "smtp" | "resend" = "smtp",
  ) {}
  async send(e: OutboundEmail): Promise<SendResult> {
    const r = this.behavior();
    if (r.kind === "accepted") this.sent.push(e);
    return r;
  }
}

class FakeDomains implements DomainPort {
  readonly name = "resend" as const;
  status = new Map<string, DomainStatus>();
  removed: string[] = [];
  async create(domain: string): Promise<ProviderDomain> {
    const id = `d_${randomUUID().slice(0, 8)}`;
    this.status.set(id, "pending");
    return { id, name: domain, status: "pending", records: [{ record: "DKIM", type: "TXT", name: "resend._domainkey", value: "p=MIGf…", priority: null, ttl: "Auto", status: "not_started" }] };
  }
  async get(id: string): Promise<ProviderDomain> {
    return { id, name: "x", status: this.status.get(id) ?? "pending", records: [] };
  }
  async verify(): Promise<void> {}
  async remove(id: string): Promise<void> {
    this.removed.push(id);
  }
}

const LINK_SECRET = "test-link-secret-0123456789abcdef0123456789";
const sender: SenderConfig = { sharedDomain: "avisos.revisaya.test", appUrl: "http://localhost:3000", linkSecret: LINK_SECRET };

type Ctx = Parameters<typeof templates.saveTemplate>[0];
const sub = (planCode: PlanCode, active = true): SubscriptionState => ({ planCode, status: active ? "active" : "canceled", active, trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });

async function admin(o: TestOrg, plan: PlanCode): Promise<Ctx & { user: { email: string } }> {
  const [{ email }] = await query<{ email: string }>("select email from auth.users where id = $1", [o.ownerId]);
  return { auth: { userId: o.ownerId }, membership: { organizationId: o.orgId, memberId: await ownerMemberId(o), role: "admin", permissions: [] }, subscription: sub(plan), user: { email } };
}

async function operator(o: TestOrg, permissions: OperatorPermission[] = ["reminders.read"]): Promise<Ctx> {
  const user = await createUser();
  const memberId = await addMember(o, user, "operator", permissions);
  return { auth: { userId: user }, membership: { organizationId: o.orgId, memberId, role: "operator", permissions }, subscription: sub("business") };
}

const template = (extra: Partial<Parameters<typeof templates.saveTemplate>[1]> = {}) => ({
  kind: "reminder_service_date" as const,
  subject: "¡{nombre}, toca revisar tu {modelo}!",
  body: "Hola {nombre}:\n\nTu {modelo} ({matricula}) tiene revisión el {fecha_revision}.\n\n{taller}",
  buttonLabel: "Reservar",
  buttonEnabled: true,
  ...extra,
});

async function readyReminder(o: TestOrg, email = `c-${randomUUID().slice(0, 8)}@cliente.test`) {
  await query(
    `update branch_settings set reminders_enabled = true, send_window_start = '00:00', send_window_end = '23:59:59', send_weekdays = '{1,2,3,4,5,6,7}',
            reply_to_email = 'taller@taller.test' where branch_id = $1`,
    [o.branchId],
  );
  const [{ id: customerId }] = await query<{ id: string }>("insert into customers (organization_id, branch_id, first_name, email) values ($1, $2, 'Rosa', $3) returning id", [o.orgId, o.branchId, email]);
  const [{ id: vehicleId }] = await query<{ id: string }>(
    "insert into vehicles (organization_id, branch_id, customer_id, plate, make, model, next_service_date, next_service_source) values ($1, $2, $3, $4, 'Kia', 'Ceed', '2027-04-01', 'manual') returning id",
    [o.orgId, o.branchId, customerId, `${String(Math.floor(1000 + Math.random() * 8999))} MNP`],
  );
  const [{ id }] = await query<{ id: string }>(
    `insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
     values ($1, $2, $3, $4, 'service_date', '2027-04-01', 30, now() - interval '1 minute') returning id`,
    [o.orgId, o.branchId, customerId, vehicleId],
  );
  return { id, email };
}

let org: TestOrg;
let other: TestOrg;

beforeAll(async () => {
  org = await createOrg("business");
  other = await createOrg("pro");
});

beforeEach(async () => {
  await query("update reminders set status = 'canceled', skip_reason = 'canceled_by_user' where status in ('scheduled', 'retrying')");
});

afterAll(async () => {
  await closePool();
});

describe("plantillas", () => {
  it("el administrador personaliza la plantilla y el aviso real la usa", async () => {
    const ctx = await admin(org, "business");
    expect((await templates.listTemplates(ctx))[0]).toMatchObject({ kind: "reminder_service_date", custom: false });
    await templates.saveTemplate(ctx, template());
    await templates.saveTemplate(ctx, template({ buttonLabel: "Reservar cita" }));
    const [t] = await templates.listTemplates(ctx);
    expect(t).toMatchObject({ custom: true, buttonLabel: "Reservar cita", version: 2 });

    const r = await readyReminder(org);
    const email = new FakeEmail();
    await runDispatcher({ email, sender });
    const mail = email.sent.find((m) => m.to === r.email)!;
    expect(mail.subject).toBe("¡Rosa, toca revisar tu Kia Ceed!");
    expect(mail.html).toContain("Reservar cita");
    expect(mail.text).toContain("Tu Kia Ceed");
  });

  it("restaurar vuelve a la original; operarios y otros talleres no pueden tocarla", async () => {
    const op = await operator(org);
    await expect(templates.saveTemplate(op, template({ subject: "Hackeado" }))).rejects.toMatchObject({ code: "permission_denied" });
    const foreign = await admin(other, "pro");
    await templates.saveTemplate(foreign, template({ subject: "Del otro taller" }));
    expect((await templates.listTemplates(await admin(org, "business")))[0].subject).toBe("¡{nombre}, toca revisar tu {modelo}!");
    await expect(templates.restoreTemplate({ ...foreign, membership: { ...foreign.membership, organizationId: org.orgId } }, "reminder_service_date")).rejects.toMatchObject({
      code: "not_found",
    });

    await templates.restoreTemplate(await admin(org, "business"), "reminder_service_date");
    expect((await templates.listTemplates(await admin(org, "business")))[0]).toMatchObject({ custom: false, subject: "Revisión de tu {modelo} en {taller}" });
    await templates.restoreTemplate(foreign, "reminder_service_date");
  });

  it("correo de prueba: va al administrador, cuenta en el consumo y se registra", async () => {
    const ctx = await admin(org, "business");
    const used = async () => (await query<{ used: number }>("select coalesce(sum(used), 0)::int as used from usage_counters where organization_id = $1", [org.orgId]))[0].used;
    const before = await used();
    const email = new FakeEmail();
    expect(await templates.sendTestEmail(ctx, template(), { email, sender })).toEqual({ to: ctx.user.email });
    expect(email.sent[0]).toMatchObject({ to: ctx.user.email });
    expect(email.sent[0].subject.startsWith("[Prueba] ")).toBe(true);
    expect(email.sent[0].from).toContain(`@${sender.sharedDomain}`);
    expect(await used()).toBe(before + 1);
    const [log] = await query<{ status: string }>("select status from email_logs where organization_id = $1 and kind = 'test' order by id desc limit 1", [org.orgId]);
    expect(log.status).toBe("accepted");

    // Si el proveedor lo rechaza, no cuenta.
    await expect(templates.sendTestEmail(ctx, template(), { email: new FakeEmail(() => ({ kind: "permanent", code: "x", message: "no" })), sender })).rejects.toMatchObject({
      code: "email_send_failed",
    });
    expect(await used()).toBe(before + 1);
    await expect(templates.sendTestEmail(ctx, template(), { email: null, sender })).rejects.toMatchObject({ code: "email_not_configured" });
    await expect(templates.sendTestEmail({ ...ctx, subscription: sub("business", false) }, template(), { email, sender })).rejects.toMatchObject({
      code: "subscription_inactive",
    });
  });
});

describe("dominio propio", () => {
  it("alta → registros DNS → verificación → remitente propio → deja de estar verificado → vuelve al compartido", async () => {
    const ctx = await admin(org, "business");
    const port = new FakeDomains();
    const id = await domains.addDomain(ctx, { domain: `taller-${randomUUID().slice(0, 6)}.es`, fromLocalPart: "avisos" }, port);
    let [d] = (await domains.listDomains(ctx)).filter((x) => x.id === id);
    expect(d).toMatchObject({ status: "pending", records: [{ type: "TXT", name: "resend._domainkey" }] });

    // Sin verificar no se puede usar como remitente (lo impide la BD).
    await expect(settings.updateSenderSettings(ctx, { branchId: org.branchId, senderMode: "custom_domain", sendingDomainId: id, digestFrequency: "weekly" })).rejects.toMatchObject({
      code: "validation_error",
      detail: "sending_domain_not_verified",
    });

    const remoteId = (await query<{ provider_domain_id: string }>("select provider_domain_id from sending_domains where id = $1", [id]))[0].provider_domain_id;
    port.status.set(remoteId, "verified");
    expect(await domains.checkDomain(ctx, id, port)).toBe("verified");
    [d] = (await domains.listDomains(ctx)).filter((x) => x.id === id);
    expect(d.verifiedAt).not.toBeNull();

    await settings.updateSenderSettings(ctx, { branchId: org.branchId, senderMode: "custom_domain", sendingDomainId: id, digestFrequency: "daily" });
    const r = await readyReminder(org);
    const email = new FakeEmail();
    await runDispatcher({ email, sender });
    expect(email.sent.find((m) => m.to === r.email)!.from).toContain(`<avisos@${d.domain}>`);

    // El proveedor deja de verlo verificado (DNS borrados): vuelve al remitente compartido.
    port.status.set(remoteId, "failed");
    await query("update sending_domains set last_checked_at = now() - interval '2 days' where id = $1", [id]);
    const stats = await domains.checkPendingDomains(port);
    expect(stats.checked).toBeGreaterThanOrEqual(1);
    expect(await settings.getSenderSettings(ctx, org.branchId)).toMatchObject({ senderMode: "shared", sendingDomainId: null, digestFrequency: "daily" });

    await domains.removeDomain(ctx, id, port);
    expect(port.removed).toContain(remoteId);
    expect((await domains.listDomains(ctx)).some((x) => x.id === id)).toBe(false);
  });

  it("permisos, aislamiento y límites", async () => {
    const port = new FakeDomains();
    const op = await operator(org);
    const opDomain = `op-${randomUUID().slice(0, 6)}.es`;
    await expect(domains.addDomain(op, { domain: opDomain, fromLocalPart: "avisos" }, port)).rejects.toMatchObject({ code: "permission_denied" });
    expect(await query("select 1 from sending_domains where domain = $1", [opDomain])).toHaveLength(0);
    // Ni falsificando el rol en el contexto: se comprueba en la base de datos.
    const forged = { ...op, membership: { ...op.membership, role: "admin" as const } };
    await expect(domains.addDomain(forged, { domain: opDomain, fromLocalPart: "avisos" }, port)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(templates.sendTestEmail({ ...forged, user: { email: "op@taller.test" } }, template(), { email: new FakeEmail(), sender })).rejects.toMatchObject({
      code: "permission_denied",
    });

    const ctx = await admin(org, "business");
    const id = await domains.addDomain(ctx, { domain: `uno-${randomUUID().slice(0, 6)}.es`, fromLocalPart: "avisos" }, port);
    const foreign = await admin(other, "pro");
    await expect(domains.checkDomain(foreign, id, port)).rejects.toMatchObject({ code: "not_found" });
    await expect(domains.removeDomain(foreign, id, port)).rejects.toMatchObject({ code: "not_found" });
    await expect(domains.addDomain(ctx, { domain: (await domains.listDomains(ctx))[0].domain, fromLocalPart: "avisos" }, port)).rejects.toMatchObject({ code: "conflict" });
    await domains.addDomain(ctx, { domain: `dos-${randomUUID().slice(0, 6)}.es`, fromLocalPart: "avisos" }, port);
    await domains.addDomain(ctx, { domain: `tres-${randomUUID().slice(0, 6)}.es`, fromLocalPart: "avisos" }, port);
    await expect(domains.addDomain(ctx, { domain: `cuatro-${randomUUID().slice(0, 6)}.es`, fromLocalPart: "avisos" }, port)).rejects.toMatchObject({
      detail: "too_many_domains",
    });
    await expect(domains.addDomain(ctx, { domain: "sin-proveedor.es", fromLocalPart: "avisos" }, null)).rejects.toMatchObject({ code: "email_not_configured" });
    for (const d of await domains.listDomains(ctx)) await domains.removeDomain(ctx, d.id, port);
  });
});

describe("eventos de entrega (webhook)", () => {
  const WEBHOOK_SECRET = `whsec_${Buffer.from("secreto-de-webhook-para-tests-32b").toString("base64")}`;

  async function post(body: unknown, opts: { secret?: string; id?: string } = {}) {
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const { POST } = await import("@/app/api/webhooks/email/resend/route");
    const raw = JSON.stringify(body);
    const id = opts.id ?? `msg_${randomUUID()}`;
    const ts = String(Math.floor(Date.now() / 1000));
    return POST(
      new Request("http://localhost/api/webhooks/email/resend", {
        method: "POST",
        body: raw,
        headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${signWebhook(opts.secret ?? WEBHOOK_SECRET, id, ts, raw)}` },
      }),
    );
  }

  it("entregado, rebote definitivo → supresión, y el siguiente aviso a esa dirección no se envía", async () => {
    const r = await readyReminder(org);
    await runDispatcher({ email: new FakeEmail(undefined, "resend"), sender });
    const [{ provider_message_id: msg }] = await query<{ provider_message_id: string }>("select provider_message_id from email_logs where reminder_id = $1", [r.id]);

    const delivered = await post({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: msg } }, { id: "evt-entregado-" + msg });
    expect(await delivered.json()).toMatchObject({ outcome: "delivered" });
    const again = await post({ type: "email.delivered", data: { email_id: msg } }, { id: "evt-entregado-" + msg });
    expect(await again.json()).toMatchObject({ outcome: "duplicate" });
    expect((await query<{ status: string }>("select status from reminders where id = $1", [r.id]))[0].status).toBe("delivered");

    const bounced = await post({ type: "email.bounced", data: { email_id: msg, bounce: { type: "Permanent" } } });
    expect(await bounced.json()).toMatchObject({ outcome: "hard_bounce" });
    expect(await query("select 1 from email_suppressions where organization_id = $1 and email = $2 and reason = 'hard_bounce'", [org.orgId, r.email])).toHaveLength(1);

    // Otro aviso al mismo cliente: no se envía (dirección suprimida).
    const [{ customer_id, vehicle_id }] = await query<{ customer_id: string; vehicle_id: string }>("select customer_id, vehicle_id from reminders where id = $1", [r.id]);
    const [{ id: next }] = await query<{ id: string }>(
      `insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
       values ($1, $2, $3, $4, 'service_date', '2027-04-01', 7, now() - interval '1 minute') returning id`,
      [org.orgId, org.branchId, customer_id, vehicle_id],
    );
    const email = new FakeEmail();
    await runDispatcher({ email, sender });
    expect(email.sent.some((m) => m.to === r.email)).toBe(false);
    expect((await query<{ status: string; skip_reason: string }>("select status, skip_reason from reminders where id = $1", [next]))[0]).toEqual({
      status: "skipped",
      skip_reason: "suppressed",
    });
  });

  it("firma no válida → 401; sin secreto configurado → 503", async () => {
    const res = await post({ type: "email.delivered", data: { email_id: "x" } }, { secret: `whsec_${Buffer.from("otro").toString("base64")}` });
    expect(res.status).toBe(401);
    delete process.env.RESEND_WEBHOOK_SECRET;
    const { POST } = await import("@/app/api/webhooks/email/resend/route");
    expect((await POST(new Request("http://localhost/x", { method: "POST", body: "{}" }))).status).toBe(503);
  });
});

describe("direcciones bloqueadas", () => {
  it("el administrador bloquea y desbloquea a mano; los rebotes no se pueden quitar", async () => {
    const ctx = await admin(org, "business");
    await settings.addSuppression(ctx, "manual@cliente.test");
    expect((await settings.listSuppressions(ctx)).map((s) => s.email)).toContain("manual@cliente.test");
    await expect(settings.addSuppression(ctx, "manual@cliente.test")).rejects.toMatchObject({ code: "conflict" });
    await settings.removeSuppression(ctx, "manual@cliente.test");
    await query("insert into email_suppressions (organization_id, email, reason) values ($1, 'rebote@cliente.test', 'hard_bounce')", [org.orgId]);
    await expect(settings.removeSuppression(ctx, "rebote@cliente.test")).rejects.toMatchObject({ code: "not_found" });
    expect(await settings.listSuppressions(await admin(other, "pro"))).toEqual([]);
    expect(await settings.listSuppressions(await operator(org))).toEqual([]);
  });
});

describe("avisos de consumo y resumen al taller", () => {
  it("80 % y 100 %: un aviso por umbral y mes, a los administradores", async () => {
    const o = await createOrg("pro"); // 500 correos/mes
    const [{ period }] = await query<{ period: string }>("select app.usage_period($1)::text as period", [o.orgId]);
    await query("insert into usage_counters (organization_id, resource, period_start, used, limit_snapshot) values ($1, 'emails', $2, 400, 500)", [o.orgId, period]);
    const [{ email: ownerEmail }] = await query<{ email: string }>("select email from auth.users where id = $1", [o.ownerId]);

    // Si no sale, se libera y se reintenta.
    await notifyUsage({ email: new FakeEmail(() => ({ kind: "retryable", code: "x", message: "caído" })), sender });
    expect((await query<{ a: Date | null }>("select alert_80_sent_at as a from usage_counters where organization_id = $1", [o.orgId]))[0].a).toBeNull();
    const email = new FakeEmail();
    await notifyUsage({ email, sender });
    const mine = () => email.sent.filter((m) => m.to === ownerEmail);
    expect(mine()).toHaveLength(1);
    expect(mine()[0].subject).toBe("Has usado el 80 % de tus correos");
    expect(mine()[0].from).toBe(`"RevisaYa" <no_reply@${sender.sharedDomain}>`);
    await notifyUsage({ email, sender });
    expect(mine()).toHaveLength(1);

    await query("update usage_counters set used = 500 where organization_id = $1", [o.orgId]);
    await notifyUsage({ email, sender });
    expect(mine().map((m) => m.subject)).toEqual(["Has usado el 80 % de tus correos", "Límite de correos alcanzado"]);
    expect(await query("select 1 from email_logs where organization_id = $1 and kind = 'usage_alert' and status = 'accepted'", [o.orgId])).toHaveLength(2);
    // Los avisos de la plataforma no consumen correos del taller.
    expect((await query<{ used: number }>("select used from usage_counters where organization_id = $1", [o.orgId]))[0].used).toBe(500);
  });

  it("resumen diario a partir de las 08:00 locales, una vez por día; semanal solo los lunes", async () => {
    const o = await createOrg("max");
    await query("update branch_settings set digest_frequency = 'daily' where branch_id = $1", [o.branchId]);
    await readyReminder(o);
    const [{ email: ownerEmail }] = await query<{ email: string }>("select email from auth.users where id = $1", [o.ownerId]);
    const mine = (e: FakeEmail) => e.sent.filter((m) => m.to === ownerEmail);

    const early = new FakeEmail();
    await sendDigests({ email: early, sender }, new Date("2026-11-10T06:30:00Z")); // 07:30 en Madrid
    expect(mine(early)).toHaveLength(0);

    const email = new FakeEmail();
    await sendDigests({ email, sender }, new Date("2026-11-10T08:30:00Z")); // 09:30 en Madrid
    expect(mine(email)).toHaveLength(1);
    expect(mine(email)[0].subject).toBe("Resumen diario de avisos · Taller de prueba");
    expect(mine(email)[0].text).toContain("Avisos programados: 1");
    await sendDigests({ email, sender }, new Date("2026-11-10T15:00:00Z"));
    expect(mine(email)).toHaveLength(1);

    await query("update branch_settings set digest_frequency = 'weekly' where branch_id = $1", [o.branchId]);
    const weekly = new FakeEmail();
    await sendDigests({ email: weekly, sender }, new Date("2026-11-11T09:00:00Z")); // miércoles
    expect(mine(weekly)).toHaveLength(0);
    await sendDigests({ email: weekly, sender }, new Date("2026-11-16T09:00:00Z")); // lunes
    expect(mine(weekly)).toHaveLength(1);
    expect(mine(weekly)[0].subject).toContain("Resumen semanal");

    // Sin proveedor configurado, no se envía ni se reserva nada.
    expect(await sendDigests({ email: null, sender }, new Date("2026-11-17T09:00:00Z"))).toEqual({ sent: 0, skipped: 0, failed: 0 });
  });
});
