import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { addDays, todayIn } from "@/lib/dates";
import { DEFAULT_TEMPLATES, renderReminderEmail, type TemplateContent } from "@/lib/email/reminder-email";
import { EDITABLE_TEMPLATE_KINDS, type EditableTemplateKind, type TemplateInput } from "@/lib/validation/email";
import type { OrgContext } from "@/server/auth/context";
import { withRls, withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import type { EmailPort } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { resolveWorkshopSender } from "@/server/email/sender";
import type { ServiceCtx } from "@/server/modules/branches/service";
import { logoUrl } from "@/server/modules/organizations/profile";
import { enforceRateLimits, RATE_LIMITS } from "@/server/security/rate-limit";

import { assertOrgAdmin } from "@/server/auth/db-guards";

/**
 * Plantillas de los avisos (editables en todos los planes, P10): asunto,
 * texto, texto del botón y botón sí/no. Una personalización por taller
 * (organización); "restaurar" la borra y vuelve la original del PDF.
 */

type Ctx = ServiceCtx & Pick<OrgContext, "subscription">;

export interface TemplateView extends TemplateContent {
  kind: EditableTemplateKind;
  custom: boolean;
  version: number | null;
  updatedAt: Date | null;
}

export async function listTemplates(ctx: Ctx): Promise<TemplateView[]> {
  const rows = await withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("email_templates")
      .select(["kind", "subject", "body", "button_label", "button_enabled", "version", "updated_at"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("branch_id", "is", null)
      .where("status", "=", "active")
      .where("kind", "in", [...EDITABLE_TEMPLATE_KINDS])
      .execute(),
  );
  return EDITABLE_TEMPLATE_KINDS.map((kind) => {
    const t = rows.find((r) => r.kind === kind);
    return t
      ? { kind, custom: true, subject: t.subject, body: t.body, buttonLabel: t.button_label, buttonEnabled: t.button_enabled, version: t.version, updatedAt: t.updated_at }
      : { kind, custom: false, ...DEFAULT_TEMPLATES[kind], version: null, updatedAt: null };
  });
}

function assertWritable(ctx: Ctx) {
  if (!ctx.subscription.active) throw new DomainError("subscription_inactive");
}

export async function saveTemplate(ctx: Ctx, input: TemplateInput): Promise<void> {
  assertWritable(ctx);
  const orgId = ctx.membership.organizationId;
  await withRls(ctx.auth, async (tx) => {
    const values = {
      subject: input.subject,
      body: input.body,
      button_label: input.buttonLabel,
      button_enabled: input.buttonEnabled,
      updated_by: ctx.auth.userId,
    };
    const updated = await tx
      .updateTable("email_templates")
      .set(values)
      .where("organization_id", "=", orgId)
      .where("branch_id", "is", null)
      .where("kind", "=", input.kind)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) > 0) return;
    // RLS: solo administradores. Si no lo es, el INSERT falla (42501).
    await tx
      .insertInto("email_templates")
      .values({ organization_id: orgId, branch_id: null, kind: input.kind, status: "active", ...values })
      .execute();
  });
}

export async function restoreTemplate(ctx: Ctx, kind: EditableTemplateKind): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .deleteFrom("email_templates")
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("branch_id", "is", null)
      .where("kind", "=", kind)
      .executeTakeFirst();
    if (Number(res.numDeletedRows) === 0) throw new DomainError("not_found");
  });
}

// ------------------------------------------------------ vista previa y prueba

export interface PreviewSample {
  customerFirstName: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  plate: string;
  dueDate: string;
  workshop: { name: string; brandColor: string | null; address: string | null; phone: string | null; email: string | null; logoUrl: string | null };
  ctaHref: string | null;
  fromExample: boolean;
}

/**
 * Datos para la vista previa: un vehículo real del taller con próxima
 * revisión (si hay) o un ejemplo. Solo datos que el usuario ya puede ver.
 */
export async function previewSample(ctx: Ctx): Promise<PreviewSample> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const org = await tx
      .selectFrom("organizations as o")
      .leftJoin("branches as b", (j) => j.onRef("b.organization_id", "=", "o.id").on("b.is_primary", "=", true))
      .leftJoin("branch_settings as bs", "bs.branch_id", "b.id")
      .select([
        "o.trade_name as name",
        "o.brand_primary as brandColor",
        "o.logo_path as logoPath",
        "o.timezone",
        sql<string | null>`coalesce(b.phone, o.phone)`.as("phone"),
        sql<string | null>`coalesce(bs.reply_to_email::text, b.email::text, o.email::text)`.as("email"),
        sql<string | null>`nullif(concat_ws(', ', coalesce(b.address_line1, o.address_line1), coalesce(b.city, o.city)), '')`.as("address"),
      ])
      .where("o.id", "=", orgId)
      .executeTakeFirstOrThrow();
    const vehicle = await tx
      .selectFrom("vehicles as v")
      .innerJoin("customers as c", "c.id", "v.customer_id")
      .select(["c.first_name as firstName", "v.make", "v.model", "v.plate", sql<string>`v.next_service_date::text`.as("due")])
      .where("v.organization_id", "=", orgId)
      .where("v.deleted_at", "is", null)
      .where("v.status", "=", "active")
      .where("v.next_service_date", "is not", null)
      .orderBy("v.next_service_date")
      .limit(1)
      .executeTakeFirst();
    // Ruta relativa: la vista previa del panel la resuelve en el mismo origen.
    const logo = logoUrl("http://local", orgId, org.logoPath)?.replace("http://local", "") ?? null;
    const workshop = { name: org.name, brandColor: org.brandColor, address: org.address, phone: org.phone, email: org.email, logoUrl: logo };
    const ctaHref = org.email ? `mailto:${org.email}` : null;
    return vehicle
      ? { customerFirstName: vehicle.firstName, vehicleMake: vehicle.make, vehicleModel: vehicle.model, plate: vehicle.plate, dueDate: vehicle.due, workshop, ctaHref, fromExample: false }
      : {
          customerFirstName: "Laura",
          vehicleMake: "Seat",
          vehicleModel: "Ibiza",
          plate: "1234 BCD",
          dueDate: addDays(todayIn(org.timezone), 30),
          workshop,
          ctaHref,
          fromExample: true,
        };
  });
}

/**
 * Correo de prueba al administrador con el contenido del formulario (aunque
 * no esté guardado). Cuenta en el consumo mensual (P5) y como mucho 20 al día.
 */
export async function sendTestEmail(
  ctx: Ctx & { user: { email: string } },
  input: TemplateInput,
  deps: { email: EmailPort | null; sender: SenderConfig | null },
): Promise<{ to: string }> {
  assertWritable(ctx);
  if (!deps.email || !deps.sender) throw new DomainError("email_not_configured");
  await assertOrgAdmin(ctx);
  const orgId = ctx.membership.organizationId;
  await enforceRateLimits([[`test-email:org:${orgId}`, RATE_LIMITS.testEmailsPerOrg]]);

  const sample = await previewSample(ctx);
  const sender = await withSystem((tx) => resolveWorkshopSender(tx, orgId, deps.sender!));
  const period = await withSystem(async (tx) => {
    const { rows } = await sql<{ p: string | null }>`select app.reserve_usage(${orgId}::uuid, 'emails')::text as p`.execute(tx);
    return rows[0]?.p ?? null;
  });
  if (!period) throw new DomainError("plan_limit_reached", "emails");

  const rendered = renderReminderEmail({
    template: { subject: input.subject, body: input.body, buttonLabel: input.buttonLabel, buttonEnabled: input.buttonEnabled },
    customerFirstName: sample.customerFirstName,
    vehicleMake: sample.vehicleMake,
    vehicleModel: sample.vehicleModel,
    plate: sample.plate,
    dueDate: sample.dueDate,
    workshop: { ...sample.workshop, logoUrl: sample.workshop.logoUrl ? new URL(sample.workshop.logoUrl, deps.sender.appUrl).toString() : null },
    ctaHref: sample.ctaHref,
    unsubscribeUrl: new URL("/baja/ejemplo", deps.sender.appUrl).toString(),
  });
  const subject = `[Prueba] ${rendered.subject}`.slice(0, 200);
  const result = await deps.email
    .send({
      from: sender.from,
      to: ctx.user.email,
      replyTo: sender.replyTo ?? undefined,
      subject,
      html: rendered.html,
      text: rendered.text,
      headers: {},
      idempotencyKey: `test-${randomUUID()}`,
      tags: { kind: "test", organization_id: orgId },
    })
    .catch((err: Error) => ({ kind: "retryable" as const, code: "adapter_exception", message: err.message }));

  await withSystem(async (tx) => {
    if (result.kind !== "accepted") {
      await sql`select app.release_usage(${orgId}::uuid, 'emails', ${period}::date)`.execute(tx);
    }
    await tx
      .insertInto("email_logs")
      .values({
        organization_id: orgId,
        branch_id: sender.branchId,
        kind: "test",
        to_email: ctx.user.email,
        from_email: sender.fromAddress,
        reply_to: sender.replyTo,
        subject,
        provider: deps.email!.name,
        provider_message_id: result.kind === "accepted" ? result.messageId : null,
        status: result.kind === "accepted" ? "accepted" : "failed",
        error_code: result.kind === "accepted" ? null : result.code.slice(0, 100),
        sent_at: result.kind === "accepted" ? new Date() : null,
      })
      .execute();
  });
  if (result.kind !== "accepted") throw new DomainError("email_send_failed");
  return { to: ctx.user.email };
}
