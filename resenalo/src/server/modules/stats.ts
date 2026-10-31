import { EmailJobStatus } from "@prisma/client";
import { prisma } from "../db";
import { getCurrentUsage, getEntitlements } from "./billing/entitlements";
import { PENDING_JOB_STATUSES } from "./automation/requests";

export async function usageSummary(businessId: string) {
  const usage = await getCurrentUsage(businessId);
  const pending = await prisma.emailJob.count({ where: { businessId, status: { in: PENDING_JOB_STATUSES } } });
  if (!usage) return null;
  const committed = usage.sent + pending;
  return {
    periodStart: usage.periodStart,
    periodEnd: usage.periodEnd,
    limit: usage.emailLimit,
    sent: usage.sent,
    failed: usage.failed,
    pending,
    // Disponibles = límite − enviados − pendientes (los pendientes ya tienen cupo comprometido)
    available: Math.max(0, usage.emailLimit - committed),
    percentUsed: usage.emailLimit ? Math.min(100, Math.round((usage.sent / usage.emailLimit) * 100)) : 0,
  };
}

/** Estadísticas reales a partir de los envíos registrados. Nunca se inventan datos. */
export async function getStats(businessId: string, opts: { days?: number } = {}) {
  const ent = await getEntitlements(businessId);
  const advanced = Boolean(ent.features?.advancedStats);
  const days = Math.min(opts.days ?? (advanced ? 90 : 30), advanced ? 365 : 30);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true, trackClicks: true } });
  const since = new Date(Date.now() - days * 86400_000);

  const byStatus = await prisma.emailJob.groupBy({ by: ["status"], where: { businessId }, _count: true });
  const totals = Object.fromEntries(Object.values(EmailJobStatus).map((s) => [s, 0])) as Record<EmailJobStatus, number>;
  for (const r of byStatus) totals[r.status] = r._count;

  const tz = business.timezone;
  const series = await prisma.$queryRaw<{ day: Date; sent: bigint; failed: bigint; clicked: bigint }[]>`
    WITH d AS (
      SELECT generate_series(date_trunc('day', (now() AT TIME ZONE ${tz}) - make_interval(days => ${days - 1}::int)), date_trunc('day', now() AT TIME ZONE ${tz}), interval '1 day') AS day
    )
    SELECT d.day,
      (SELECT count(*) FROM email_jobs j WHERE j.business_id = ${businessId} AND j.sent_at IS NOT NULL AND date_trunc('day', j.sent_at AT TIME ZONE ${tz}) = d.day) AS sent,
      (SELECT count(*) FROM email_jobs j WHERE j.business_id = ${businessId} AND j.failed_at IS NOT NULL AND j.status IN ('FAILED','BOUNCED') AND date_trunc('day', j.failed_at AT TIME ZONE ${tz}) = d.day) AS failed,
      (SELECT count(*) FROM email_jobs j WHERE j.business_id = ${businessId} AND j.first_clicked_at IS NOT NULL AND date_trunc('day', j.first_clicked_at AT TIME ZONE ${tz}) = d.day) AS clicked
    FROM d ORDER BY d.day`;

  const sentInRange = await prisma.emailJob.count({ where: { businessId, sentAt: { gte: since } } });
  const clickedInRange = await prisma.emailJob.count({ where: { businessId, sentAt: { gte: since }, firstClickedAt: { not: null } } });

  let byRule: { ruleId: string | null; name: string; sent: number; failed: number; pending: number; clicked: number }[] = [];
  let bySource: { source: string; count: number }[] = [];
  if (advanced) {
    const rows = await prisma.$queryRaw<{ rule_id: string | null; name: string | null; sent: bigint; failed: bigint; pending: bigint; clicked: bigint }[]>`
      SELECT j.rule_id, COALESCE(r.name, CASE WHEN j.campaign_id IS NOT NULL THEN 'Campañas' ELSE 'Sin regla' END) AS name,
        count(*) FILTER (WHERE j.status IN ('SENT','DELIVERED')) AS sent,
        count(*) FILTER (WHERE j.status IN ('FAILED','BOUNCED')) AS failed,
        count(*) FILTER (WHERE j.status IN ('SCHEDULED','QUEUED','SENDING','ON_HOLD')) AS pending,
        count(*) FILTER (WHERE j.first_clicked_at IS NOT NULL) AS clicked
      FROM email_jobs j LEFT JOIN automation_rules r ON r.id = j.rule_id
      WHERE j.business_id = ${businessId} AND j.created_at >= ${since}
      GROUP BY j.rule_id, 2 ORDER BY sent DESC`;
    byRule = rows.map((r) => ({ ruleId: r.rule_id, name: r.name ?? "—", sent: Number(r.sent), failed: Number(r.failed), pending: Number(r.pending), clicked: Number(r.clicked) }));
    const src = await prisma.automationEvent.groupBy({ by: ["source"], where: { businessId, createdAt: { gte: since } }, _count: true });
    bySource = src.map((s) => ({ source: s.source, count: s._count }));
  }

  const recent = await prisma.emailLog.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { job: { select: { toName: true, toEmail: true } } },
  });

  return {
    days,
    advanced,
    full: Boolean(ent.features?.fullStats),
    trackClicks: business.trackClicks,
    usage: await usageSummary(businessId),
    totals: {
      sent: totals.SENT + totals.DELIVERED,
      delivered: totals.DELIVERED,
      pending: totals.SCHEDULED + totals.QUEUED + totals.SENDING + totals.ON_HOLD,
      onHold: totals.ON_HOLD,
      failed: totals.FAILED + totals.BOUNCED,
      bounced: totals.BOUNCED,
      blocked: totals.BLOCKED,
      canceled: totals.CANCELED,
    },
    range: { sent: sentInRange, clicked: clickedInRange, clickRate: sentInRange ? Math.round((clickedInRange / sentInRange) * 1000) / 10 : null },
    series: series.map((s) => ({ day: s.day.toISOString().slice(0, 10), sent: Number(s.sent), failed: Number(s.failed), clicked: Number(s.clicked) })),
    byRule,
    bySource,
    recent: recent.map((l) => ({ id: l.id, event: l.event, message: l.message, createdAt: l.createdAt, to: l.job.toName || l.job.toEmail })),
    // Gmail y Microsoft Graph no informan de entregas ni de reseñas publicadas:
    deliveryTracking: false,
    reviewsTracking: false,
  };
}

export async function exportJobsCsvRows(businessId: string) {
  const jobs = await prisma.emailJob.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 10000,
    include: { rule: { select: { name: true } }, event: { select: { source: true, serviceName: true } } },
  });
  return [
    ["fecha_creacion", "destinatario", "email", "servicio", "origen", "automatizacion", "estado", "motivo", "enviado", "clics"],
    ...jobs.map((j) => [
      j.createdAt.toISOString(),
      j.toName,
      j.toEmail,
      j.event?.serviceName ?? "",
      j.event?.source ?? "",
      j.rule?.name ?? "",
      j.status,
      j.statusReason ?? "",
      j.sentAt?.toISOString() ?? "",
      j.clickCount,
    ]),
  ];
}

export type StatsResult = Awaited<ReturnType<typeof getStats>>;
