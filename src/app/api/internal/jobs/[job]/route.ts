import { sql } from "kysely";
import { NextResponse } from "next/server";

import { withSystem } from "@/server/db/client";
import { getDomainProvider } from "@/server/email/domains";
import { getEmailProvider, getSenderConfig } from "@/server/email/provider";
import { isAuthorizedJobRequest } from "@/server/jobs/auth";
import { logger } from "@/server/logger";
import { syncCatalog } from "@/server/billing/catalog";
import { getStripe } from "@/server/billing/stripe";
import { reconcileSubscriptions } from "@/server/modules/billing/service";
import { syncPendingCalendar } from "@/server/modules/integrations/calendar";
import { checkPendingDomains } from "@/server/modules/email/domains";
import { checkEmailReputation, notifyUsage, sendDigests } from "@/server/modules/email/notifications";
import { processStorageDeletions, purgeExpiredOrganizations, sendRetentionWarnings } from "@/server/modules/retention/service";
import { runDispatcher } from "@/server/reminders/dispatcher";

/**
 * Disparadores de procesos programados:
 *   dispatch-reminders · cada minuto (Vercel Cron, pg_net u otro planificador)
 *   plan-reminders     · también lo ejecuta pg_cron cada hora; aquí, a demanda
 *   release-leases     · recuperación de envíos bloqueados
 *   email-maintenance  · cada 30 min: verificación de dominios, avisos de
 *                        consumo (80 %/100 %) y resúmenes al taller
 *   billing-reconcile  · diario: respaldo de los webhooks de Stripe
 *   calendar-sync      · cada 15 min: reintenta lo pendiente en Google Calendar
 *   retention          · diario: aviso 7 días antes y borrado a los 60 días de la baja (P9)
 *   status             · últimas ejecuciones (monitorización / dead-man switch)
 * GET (Vercel Cron) o POST, con Authorization: Bearer CRON_SECRET.
 */

/** El dispatcher y las purgas pueden tardar más que el límite por defecto. */
export const maxDuration = 300;

async function handle(request: Request, job: string) {
  if (!isAuthorizedJobRequest(request)) {
    return NextResponse.json({ error: { code: "unauthenticated" } }, { status: 401 });
  }
  try {
    switch (job) {
      case "dispatch-reminders": {
        const stats = await runDispatcher({ email: getEmailProvider(), sender: getSenderConfig() });
        return NextResponse.json({ ok: true, stats });
      }
      case "plan-reminders": {
        const stats = await withSystem(async (tx) => (await sql<{ s: unknown }>`select private.plan_reminders() as s`.execute(tx)).rows[0].s);
        return NextResponse.json({ ok: true, stats });
      }
      case "email-maintenance": {
        const deps = { email: getEmailProvider(), sender: getSenderConfig() };
        const run = await withSystem(async (tx) => (await sql<{ id: string }>`insert into private.job_runs (job_name) values ('email_maintenance') returning id::text`.execute(tx)).rows[0].id);
        const stats = {
          domains: await checkPendingDomains(getDomainProvider()),
          usage: await notifyUsage(deps),
          digests: await sendDigests(deps),
          reputation: await checkEmailReputation(deps),
          provider: deps.email ? "configured" : "not_configured",
        };
        const partial = stats.domains.failed + stats.usage.failed + stats.digests.failed > 0;
        await withSystem((tx) =>
          sql`update private.job_runs set finished_at = now(), status = ${partial ? "partial" : "succeeded"}, stats = ${JSON.stringify(stats)}::jsonb where id = ${run}::bigint`.execute(tx),
        );
        return NextResponse.json({ ok: true, stats });
      }
      case "billing-reconcile": {
        // Respaldo de los webhooks: vuelve a leer de Stripe las suscripciones vivas.
        return NextResponse.json({ ok: true, stats: await reconcileSubscriptions() });
      }
      case "stripe-sync-catalog": {
        // Alta (idempotente) de productos y precios de los planes en Stripe (modo TEST).
        const stripe = getStripe();
        if (!stripe) return NextResponse.json({ error: { code: "payments_not_configured" } }, { status: 503 });
        return NextResponse.json({ ok: true, prices: await syncCatalog(stripe) });
      }
      case "retention": {
        const deps = { email: getEmailProvider(), sender: getSenderConfig() };
        return NextResponse.json({
          ok: true,
          stats: { warnings: await sendRetentionWarnings(deps), purge: await purgeExpiredOrganizations(), storage: await processStorageDeletions() },
        });
      }
      case "calendar-sync": {
        return NextResponse.json({ ok: true, stats: await syncPendingCalendar() });
      }
      case "release-leases": {
        const n = await withSystem(async (tx) => (await sql<{ n: number }>`select private.release_expired_reminder_leases() as n`.execute(tx)).rows[0].n);
        return NextResponse.json({ ok: true, released: n });
      }
      case "status": {
        const runs = await withSystem(async (tx) => {
          const { rows } = await sql<{ job_name: string; last_success: Date | null; last_status: string | null; last_stats: unknown }>`
            select j.job_name,
                   max(j.finished_at) filter (where j.status in ('succeeded', 'partial')) as last_success,
                   (array_agg(j.status order by j.started_at desc))[1] as last_status,
                   (array_agg(j.stats order by j.started_at desc))[1] as last_stats
              from private.job_runs j
             where j.started_at > now() - interval '7 days'
             group by j.job_name
          `.execute(tx);
          return rows;
        });
        const plan = runs.find((r) => r.job_name === "plan_reminders");
        // El planificador corre cada hora: más de 26 h sin éxito es una alerta.
        const healthy = Boolean(plan?.last_success && Date.now() - new Date(plan.last_success).getTime() < 26 * 3600_000);
        return NextResponse.json({ ok: healthy, runs }, { status: healthy ? 200 : 503 });
      }
      default:
        return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    }
  } catch (err) {
    logger.error("job_failed", { job, error: err });
    return NextResponse.json({ error: { code: "internal_error" } }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  return handle(request, (await params).job);
}

export async function POST(request: Request, { params }: { params: Promise<{ job: string }> }) {
  return handle(request, (await params).job);
}
