import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { DEFAULT_TEMPLATES, type ReminderKind, renderReminderEmail, type TemplateContent } from "@/lib/email/reminder-email";
import { withSystem } from "@/server/db/client";
import { unsubscribeToken } from "@/server/email/links";
import { type EmailPort, sanitizeProviderMessage, type SendResult } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { logger } from "@/server/logger";

/**
 * Dispatcher de recordatorios (docs/AUTOMATIZACIONES.md §3).
 *
 *  - Reclama lotes con `private.claim_reminders` (SKIP LOCKED + lease + reparto
 *    justo por taller): varios procesos en paralelo no envían dos veces.
 *  - Antes de enviar revalida TODO con los datos actuales.
 *  - "Enviado" solo cuando el proveedor acepta el mensaje.
 *  - Un error en un recordatorio o un taller nunca detiene a los demás.
 *  - Reintentos con backoff exponencial y jitter; corte si el proveedor cae.
 *  - Recuperación: si un proceso caído ya lo había enviado (email_logs), se
 *    marca como enviado sin reenviar; con el proveedor, la misma clave de
 *    idempotencia en el reintento.
 */

export interface DispatchOptions {
  email: EmailPort | null;
  sender: SenderConfig | null;
  worker?: string;
  batchSize?: number;
  perOrg?: number;
  concurrency?: number;
  /** Tiempo máximo de ejecución (las funciones serverless tienen límite). */
  timeBudgetMs?: number;
  maxBatches?: number;
}

export interface DispatchStats {
  claimed: number;
  sent: number;
  recovered: number;
  retried: number;
  failed: number;
  skipped: number;
  canceled: number;
  rescheduled: number;
  stopped?: "provider_not_configured" | "circuit_breaker" | "time_budget";
}

type Outcome = "sent" | "recovered" | "retried" | "failed" | "skipped" | "canceled" | "rescheduled" | "gone" | "provider_down";

const BACKOFF_MINUTES = [1, 5, 30, 120, 360];

/** Espera antes del intento n+1 (n = intentos ya hechos), con ±20 % de jitter. */
export function backoffMs(attempts: number, random = Math.random): number {
  const base = BACKOFF_MINUTES[Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1] * 60_000;
  return Math.round(base * (0.8 + random() * 0.4));
}

function displayName(name: string): string {
  return `"${name.replace(/["\\\r\n]/g, "").slice(0, 70)}"`;
}

interface ReminderContext {
  id: string;
  organization_id: string;
  branch_id: string;
  customer_id: string;
  vehicle_id: string;
  type: "service_date" | "service_km";
  due_date: string;
  attempts: number;
  max_attempts: number;
  plate: string;
  make: string | null;
  model: string | null;
  vehicle_active: boolean;
  next_service_date: string | null;
  last_service_date: string | null;
  cycle_anchor: string | null;
  first_name: string;
  email: string | null;
  opted_out: boolean;
  customer_deleted: boolean;
  org_name: string;
  org_slug: string;
  org_active: boolean;
  brand_primary: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_address: string | null;
  reminders_enabled: boolean;
  km_enabled: boolean;
  subscription_active: boolean;
  features: string[];
  suppressed: boolean;
  in_window: boolean;
  sender_mode: string;
  custom_from: string | null;
  reply_to: string | null;
  prior_message_id: string | null;
  prior_provider: string | null;
  template_subject: string | null;
  template_body: string | null;
  template_button_label: string | null;
  template_button_enabled: boolean | null;
}

async function loadContext(id: string): Promise<ReminderContext | undefined> {
  return withSystem(async (tx) => {
    const { rows } = await sql<ReminderContext>`
      select r.id, r.organization_id, r.branch_id, r.customer_id, r.vehicle_id, r.type, r.due_date::text as due_date,
             r.attempts, r.max_attempts, r.cycle_anchor::text as cycle_anchor,
             v.plate, v.make, v.model, (v.status = 'active' and v.deleted_at is null) as vehicle_active,
             v.next_service_date::text as next_service_date, v.last_service_date::text as last_service_date,
             c.first_name, c.email::text as email, c.reminders_opt_out as opted_out, (c.deleted_at is not null) as customer_deleted,
             o.trade_name as org_name, o.slug::text as org_slug, (o.status = 'active' and b.status = 'active') as org_active,
             o.brand_primary,
             coalesce(b.phone, o.phone) as contact_phone,
             coalesce(bs.reply_to_email::text, b.email::text, o.email::text) as contact_email,
             nullif(concat_ws(', ', coalesce(b.address_line1, o.address_line1), coalesce(b.city, o.city)), '') as contact_address,
             bs.reminders_enabled, bs.km_reminders_enabled as km_enabled,
             coalesce(app.subscription_is_active(s.status, s.past_due_since), false) as subscription_active,
             coalesce(p.features, '{}') as features,
             exists (select 1 from email_suppressions es where es.organization_id = r.organization_id and es.email = c.email) as suppressed,
             (private.is_send_day(r.branch_id, (now() at time zone coalesce(b.timezone, o.timezone))::date)
               and (now() at time zone coalesce(b.timezone, o.timezone))::time between bs.send_window_start and bs.send_window_end) as in_window,
             bs.sender_mode,
             case when bs.sender_mode = 'custom_domain' and sd.status = 'verified' then sd.from_local_part || '@' || sd.domain end as custom_from,
             coalesce(bs.reply_to_email::text, b.email::text, o.email::text) as reply_to,
             pl.provider_message_id as prior_message_id, pl.provider as prior_provider,
             t.subject as template_subject, t.body as template_body, t.button_label as template_button_label,
             t.button_enabled as template_button_enabled
        from reminders r
        join vehicles v on v.id = r.vehicle_id
        join customers c on c.id = r.customer_id
        join branches b on b.id = r.branch_id
        join organizations o on o.id = r.organization_id
        join branch_settings bs on bs.branch_id = r.branch_id
        left join sending_domains sd on sd.id = bs.sending_domain_id
        left join subscriptions s on s.organization_id = r.organization_id
        left join plans p on p.code = s.plan_code
        left join lateral (
          select el.provider_message_id, el.provider from email_logs el
          where el.reminder_id = r.id and el.status <> 'failed' order by el.id desc limit 1
        ) pl on true
        left join lateral (
          select et.subject, et.body, et.button_label, et.button_enabled from email_templates et
          where et.organization_id = r.organization_id and et.status = 'active'
            and et.kind = case r.type when 'service_km' then 'reminder_service_km' else 'reminder_service_date' end
            and (et.branch_id = r.branch_id or et.branch_id is null)
          order by et.branch_id nulls last limit 1
        ) t on true
       where r.id = ${id} and r.status = 'processing'
    `.execute(tx);
    return rows[0];
  });
}

async function finish(id: string, set: Record<string, unknown>): Promise<void> {
  await withSystem((tx) =>
    tx
      .updateTable("reminders")
      .set({ ...set, locked_until: null, locked_by: null })
      .where("id", "=", id)
      .where("status", "=", "processing")
      .execute(),
  );
}

async function skip(id: string, reason: string, status: "skipped" | "canceled" = "skipped"): Promise<Outcome> {
  await finish(id, { status, skip_reason: reason });
  return status === "canceled" ? "canceled" : "skipped";
}

function skipReason(c: ReminderContext): { reason: string; status?: "canceled" } | null {
  if (!c.org_active || !c.subscription_active) return { reason: "subscription_inactive" };
  if (!c.reminders_enabled) return { reason: "reminders_disabled" };
  if (c.type === "service_km" && (!c.km_enabled || !c.features.includes("km_reminders"))) return { reason: "feature_unavailable" };
  if (!c.features.includes("date_reminders")) return { reason: "feature_unavailable" };
  if (!c.vehicle_active || c.customer_deleted) return { reason: "vehicle_inactive", status: "canceled" };
  if (c.type === "service_date" && c.next_service_date !== c.due_date) return { reason: "superseded", status: "canceled" };
  if (c.type === "service_km" && c.last_service_date !== c.cycle_anchor) return { reason: "superseded", status: "canceled" };
  if (c.opted_out) return { reason: "opted_out" };
  if (!c.email) return { reason: "no_email" };
  if (c.suppressed) return { reason: "suppressed" };
  return null;
}

async function processOne(id: string, opts: { email: EmailPort; sender: SenderConfig }): Promise<Outcome> {
  const c = await loadContext(id);
  if (!c) return "gone";

  // Recuperación tras caída: ya se envió en un intento anterior.
  if (c.prior_message_id) {
    await finish(id, { status: "sent", provider: c.prior_provider, provider_message_id: c.prior_message_id, sent_at: new Date(), last_error: null });
    return "recovered";
  }

  const skipIt = skipReason(c);
  if (skipIt) return skip(id, skipIt.reason, skipIt.status);

  // Fuera del horario o en día sin envíos: se reprograma (no cuenta como intento).
  if (!c.in_window) {
    await withSystem((tx) =>
      sql`update reminders set status = 'scheduled', attempts = greatest(attempts - 1, 0), locked_until = null, locked_by = null,
                 -- Fecha ideal "pasada": busca el primer hueco permitido desde hoy (hora local del taller).
                 scheduled_for = private.next_send_slot(branch_id, date '2000-01-01', due_date, now() + interval '1 minute'),
                 next_attempt_at = null
           where id = ${id} and status = 'processing'`.execute(tx),
    );
    return "rescheduled";
  }

  // Cuota mensual del plan (reserva atómica; se libera si el envío falla).
  const period = await withSystem(async (tx) => {
    const { rows } = await sql<{ p: string | null }>`select app.reserve_usage(${c.organization_id}, 'emails')::text as p`.execute(tx);
    return rows[0]?.p ?? null;
  });
  if (!period) return skip(id, "quota_exceeded");
  const release = () =>
    withSystem((tx) => sql`select app.release_usage(${c.organization_id}, 'emails', ${period}::date)`.execute(tx)).catch((err) =>
      logger.error("usage_release_failed", { reminderId: id, error: err }),
    );

  const kind: ReminderKind = c.type === "service_km" ? "reminder_service_km" : "reminder_service_date";
  const template: TemplateContent = c.template_subject
    ? {
        subject: c.template_subject,
        body: c.template_body ?? DEFAULT_TEMPLATES[kind].body,
        buttonLabel: c.template_button_label ?? DEFAULT_TEMPLATES[kind].buttonLabel,
        buttonEnabled: c.template_button_enabled ?? true,
      }
    : DEFAULT_TEMPLATES[kind];

  const token = unsubscribeToken(c.customer_id, opts.sender.linkSecret);
  const unsubscribePage = new URL(`/baja/${token}`, opts.sender.appUrl).toString();
  const oneClick = new URL(`/api/public/unsubscribe/${token}`, opts.sender.appUrl).toString();
  // Hasta que exista la página pública de citas (Fase 7) el botón abre un correo al taller.
  const cta = c.reply_to ? `mailto:${c.reply_to}?subject=${encodeURIComponent(`Cita para ${c.plate}`)}` : null;

  const rendered = renderReminderEmail({
    template,
    customerFirstName: c.first_name,
    vehicleMake: c.make,
    vehicleModel: c.model,
    plate: c.plate,
    dueDate: c.due_date,
    workshop: { name: c.org_name, brandColor: c.brand_primary, address: c.contact_address, phone: c.contact_phone, email: c.contact_email },
    ctaHref: cta,
    unsubscribeUrl: unsubscribePage,
  });
  const fromAddress = c.custom_from ?? `${c.org_slug}@${opts.sender.sharedDomain}`;
  const from = `${displayName(c.org_name)} <${fromAddress}>`;

  let result: SendResult;
  try {
    result = await opts.email.send({
      from,
      to: c.email!,
      replyTo: c.reply_to ?? undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      idempotencyKey: `reminder-${c.id}`,
      tags: { reminder_id: c.id, organization_id: c.organization_id },
    });
  } catch (err) {
    result = { kind: "retryable", code: "adapter_exception", message: sanitizeProviderMessage((err as Error).message ?? "error") };
  }

  if (result.kind === "accepted") {
    await withSystem(async (tx) => {
      await tx
        .insertInto("email_logs")
        .values({
          organization_id: c.organization_id,
          branch_id: c.branch_id,
          reminder_id: c.id,
          customer_id: c.customer_id,
          vehicle_id: c.vehicle_id,
          kind: "reminder",
          to_email: c.email!,
          from_email: fromAddress,
          reply_to: c.reply_to,
          subject: rendered.subject,
          provider: opts.email.name,
          provider_message_id: result.messageId,
          status: "accepted",
          sent_at: new Date(),
        })
        .onConflict((oc) => oc.columns(["provider", "provider_message_id"]).doNothing())
        .execute();
      await tx
        .updateTable("reminders")
        .set({
          status: "sent",
          provider: opts.email.name,
          provider_message_id: result.messageId,
          sent_at: new Date(),
          last_error: null,
          locked_until: null,
          locked_by: null,
        })
        .where("id", "=", c.id)
        .execute();
    });
    return "sent";
  }

  await release();
  const error = `${result.code}: ${result.message}`.slice(0, 1000);
  if (result.kind === "retryable" && c.attempts < c.max_attempts) {
    await finish(id, { status: "retrying", next_attempt_at: new Date(Date.now() + backoffMs(c.attempts)), last_error: error });
    return result.code === "network_error" || /_(5\d\d)/.test(result.code) ? "provider_down" : "retried";
  }
  await withSystem((tx) =>
    tx
      .insertInto("email_logs")
      .values({
        organization_id: c.organization_id,
        branch_id: c.branch_id,
        reminder_id: c.id,
        customer_id: c.customer_id,
        vehicle_id: c.vehicle_id,
        kind: "reminder",
        to_email: c.email!,
        from_email: fromAddress,
        subject: rendered.subject,
        provider: opts.email.name,
        status: "failed",
        error_code: result.code.slice(0, 100),
        error_message: result.message,
      })
      .execute(),
  );
  await finish(id, { status: "failed", last_error: error });
  return "failed";
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export async function runDispatcher(options: DispatchOptions): Promise<DispatchStats> {
  const stats: DispatchStats = { claimed: 0, sent: 0, recovered: 0, retried: 0, failed: 0, skipped: 0, canceled: 0, rescheduled: 0 };
  const worker = options.worker ?? `dispatcher-${randomUUID().slice(0, 8)}`;
  const started = Date.now();
  const budget = options.timeBudgetMs ?? 50_000;

  const run = await withSystem(async (tx) => {
    const { rows } = await sql<{ id: string }>`insert into private.job_runs (job_name) values ('dispatch_reminders') returning id::text`.execute(tx);
    return rows[0].id;
  });
  const close = async (status: "succeeded" | "failed" | "partial", error?: string) => {
    await withSystem((tx) =>
      sql`update private.job_runs set finished_at = now(), status = ${status}, stats = ${JSON.stringify({ ...stats, worker })}::jsonb,
                 error = ${error ?? null} where id = ${run}::bigint`.execute(tx),
    );
  };

  if (!options.email || !options.sender) {
    stats.stopped = "provider_not_configured";
    await close("partial", "Proveedor de correo o configuración de envío no configurados: no se envía nada.");
    return stats;
  }
  const deps = { email: options.email, sender: options.sender };

  try {
    for (let batch = 0; batch < (options.maxBatches ?? 50); batch++) {
      if (Date.now() - started > budget) {
        stats.stopped = "time_budget";
        break;
      }
      const ids = await withSystem(async (tx) => {
        const { rows } = await sql<{ id: string }>`
          select c::text as id from private.claim_reminders(${worker}, ${options.batchSize ?? 100}, ${options.perOrg ?? 20}) as c
        `.execute(tx);
        return rows.map((r) => r.id);
      });
      if (!ids.length) break;
      stats.claimed += ids.length;

      const outcomes = await mapLimit(ids, options.concurrency ?? 5, async (id) => {
        try {
          return await processOne(id, deps);
        } catch (err) {
          // Error inesperado en UN recordatorio: se aísla y se reintenta más tarde.
          logger.error("reminder_dispatch_error", { reminderId: id, error: err });
          await finish(id, { status: "retrying", next_attempt_at: new Date(Date.now() + backoffMs(1)), last_error: "internal_error" }).catch(() => undefined);
          return "retried" as Outcome;
        }
      });
      for (const o of outcomes) {
        if (o === "provider_down") stats.retried++;
        else if (o !== "gone") stats[o]++;
      }
      // Corte: si el proveedor falla en la mayoría del lote, se para sin quemar intentos.
      const down = outcomes.filter((o) => o === "provider_down").length;
      if (outcomes.length >= 4 && down / outcomes.length > 0.5) {
        stats.stopped = "circuit_breaker";
        break;
      }
    }
    await close(stats.stopped === "circuit_breaker" ? "partial" : "succeeded");
  } catch (err) {
    logger.error("dispatcher_failed", { error: err });
    await close("failed", sanitizeProviderMessage((err as Error).message ?? "error")).catch(() => undefined);
    throw err;
  }
  return stats;
}
