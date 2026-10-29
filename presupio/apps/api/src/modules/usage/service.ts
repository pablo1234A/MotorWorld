import { sql } from 'kysely';
import { localParts, zonedTimeToUtc } from '../../automation/schedule.js';
import type { Trx } from '../../db/database.js';
import type { FollowUpChannel, FollowUpSource, SubscriptionStatus, UsagePeriod } from '../../db/types.js';
import { hasActiveAccess, PLANS, USAGE_WARNING_RATIO, type PlanDefinition } from '../../domain/plans.js';
import { logActivity } from '../activity/service.js';

export interface BillingPeriod {
  start: Date;
  end: Date;
  source: 'calendar_month' | 'provider';
}

/**
 * Periodo de facturación vigente:
 *  - Con un periodo del proveedor de pagos que incluye `now` (fase 5), ese periodo.
 *  - Sin él (prueba gratuita o sin proveedor), el mes natural en la zona horaria de la empresa.
 */
export function billingPeriodFor(
  sub: { currentPeriodStart: Date | null; currentPeriodEnd: Date | null },
  timezone: string,
  now: Date,
): BillingPeriod {
  if (sub.currentPeriodStart && sub.currentPeriodEnd && sub.currentPeriodStart <= now && now < sub.currentPeriodEnd) {
    return { start: sub.currentPeriodStart, end: sub.currentPeriodEnd, source: 'provider' };
  }
  const p = localParts(now, timezone);
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  return {
    start: zonedTimeToUtc(p.year, p.month, 1, 0, 0, timezone),
    end: zonedTimeToUtc(nextYear, nextMonth, 1, 0, 0, timezone),
    source: 'calendar_month',
  };
}

export interface PlanContext {
  companyId: string;
  timezone: string;
  plan: PlanDefinition | null;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  hasAccess: boolean;
  period: BillingPeriod;
}

export async function loadPlanContext(trx: Trx, companyId: string, now: Date): Promise<PlanContext> {
  const row = await trx
    .selectFrom('subscriptions as s')
    .innerJoin('companies as c', 'c.id', 's.companyId')
    .select(['s.plan', 's.status', 's.trialEndsAt', 's.currentPeriodStart', 's.currentPeriodEnd', 'c.timezone'])
    .where('s.companyId', '=', companyId)
    .executeTakeFirstOrThrow();
  return {
    companyId,
    timezone: row.timezone,
    plan: row.plan ? PLANS[row.plan] : null,
    status: row.status,
    trialEndsAt: row.trialEndsAt,
    hasAccess: hasActiveAccess(row, now),
    period: billingPeriodFor(row, row.timezone, now),
  };
}

async function findPeriod(trx: Trx, companyId: string, at: Date): Promise<UsagePeriod | undefined> {
  return trx
    .selectFrom('usagePeriods')
    .selectAll()
    .where('companyId', '=', companyId)
    .where('periodStart', '<=', at)
    .where('periodEnd', '>', at)
    .orderBy('periodStart', 'desc')
    .limit(1)
    .executeTakeFirst();
}

/**
 * Fila del periodo vigente (la crea si no existe). Si el plan sube durante el periodo, el
 * límite sube en el acto; una bajada se aplica desde el periodo siguiente.
 */
export async function ensureUsagePeriod(trx: Trx, ctx: PlanContext, now: Date): Promise<UsagePeriod> {
  const limit = ctx.plan?.monthlyRecoveryLimit ?? 0;
  const existing = await findPeriod(trx, ctx.companyId, now);
  if (existing) {
    if (limit > existing.recoveryLimit) {
      return trx
        .updateTable('usagePeriods')
        .set({ recoveryLimit: limit, plan: ctx.plan?.id ?? null })
        .where('companyId', '=', ctx.companyId)
        .where('periodStart', '=', existing.periodStart)
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    return existing;
  }
  // Sin solapes: si el periodo anterior termina después del inicio calculado, se empieza ahí.
  const previous = await trx
    .selectFrom('usagePeriods')
    .select('periodEnd')
    .where('companyId', '=', ctx.companyId)
    .where('periodEnd', '>', ctx.period.start)
    .where('periodEnd', '<=', now)
    .orderBy('periodEnd', 'desc')
    .limit(1)
    .executeTakeFirst();
  const start = previous && previous.periodEnd < ctx.period.end ? previous.periodEnd : ctx.period.start;
  await trx
    .insertInto('usagePeriods')
    .values({
      companyId: ctx.companyId,
      periodStart: start,
      periodEnd: ctx.period.end,
      periodSource: ctx.period.source,
      plan: ctx.plan?.id ?? null,
      recoveryLimit: limit,
      limitReachedAt: null,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
  return (await findPeriod(trx, ctx.companyId, now))!;
}

export type RecoveryStatus = 'counted' | 'over_limit' | 'no_active_plan';

export interface RecoveryInput {
  quoteId: string;
  respondedAt: Date;
  responseStatus: 'responded' | 'accepted';
  followUp: { id: string; source: FollowUpSource; channel: FollowUpChannel; at: Date };
}

/**
 * Registra una recuperación y la descuenta del plan. El incremento es una única sentencia
 * condicional sobre la fila del periodo: con peticiones simultáneas PostgreSQL las serializa
 * y vuelve a evaluar la condición, así que el contador nunca supera el límite (además lo
 * impide una restricción CHECK). Llamar con el presupuesto bloqueado (FOR UPDATE).
 */
export async function recordRecovery(
  trx: Trx,
  ctx: { companyId: string; userId: string | null },
  input: RecoveryInput,
  now = new Date(),
): Promise<{ status: RecoveryStatus; used: number | null; limit: number | null } | null> {
  const already = await trx
    .selectFrom('recoveryEvents')
    .select('id')
    .where('companyId', '=', ctx.companyId)
    .where('quoteId', '=', input.quoteId)
    .executeTakeFirst();
  if (already) return null;

  const plan = await loadPlanContext(trx, ctx.companyId, now);
  let status: RecoveryStatus = 'no_active_plan';
  let period: UsagePeriod | null = null;
  if (plan.hasAccess && plan.plan) {
    period = await ensureUsagePeriod(trx, plan, now);
    const counted = await trx
      .updateTable('usagePeriods')
      .set({
        recoveriesCounted: sql`recoveries_counted + 1`,
        limitReachedAt: sql`CASE WHEN recoveries_counted + 1 >= recovery_limit THEN coalesce(limit_reached_at, now()) ELSE limit_reached_at END`,
      })
      .where('companyId', '=', ctx.companyId)
      .where('periodStart', '=', period.periodStart)
      .where(sql<boolean>`recoveries_counted < recovery_limit`)
      .returningAll()
      .executeTakeFirst();
    if (counted) {
      status = 'counted';
      period = counted;
    } else {
      status = 'over_limit';
      period = await trx
        .updateTable('usagePeriods')
        .set({ recoveriesOverLimit: sql`recoveries_over_limit + 1`, limitReachedAt: sql`coalesce(limit_reached_at, now())` })
        .where('companyId', '=', ctx.companyId)
        .where('periodStart', '=', period.periodStart)
        .returningAll()
        .executeTakeFirstOrThrow();
    }
  }

  await trx
    .insertInto('recoveryEvents')
    .values({
      companyId: ctx.companyId,
      quoteId: input.quoteId,
      followUpId: input.followUp.id,
      followUpSource: input.followUp.source,
      followUpChannel: input.followUp.channel,
      followUpAt: input.followUp.at,
      respondedAt: input.respondedAt,
      responseStatus: input.responseStatus,
      registeredByUserId: ctx.userId,
      status,
      periodStart: period && status !== 'no_active_plan' ? period.periodStart : null,
    })
    .execute();

  await logActivity(trx, ctx, {
    action: 'recovery.registered',
    entityType: 'quote',
    entityId: input.quoteId,
    quoteId: input.quoteId,
    metadata: {
      status,
      used: period?.recoveriesCounted ?? null,
      limit: period?.recoveryLimit ?? null,
      followUpChannel: input.followUp.channel,
      automatic: input.followUp.source === 'rule',
    },
  });
  if (status === 'counted' && period && period.recoveriesCounted === period.recoveryLimit) {
    await logActivity(trx, ctx, {
      action: 'usage.limit_reached',
      entityType: 'company',
      entityId: ctx.companyId,
      metadata: { plan: plan.plan?.id ?? null, limit: period.recoveryLimit, periodEnd: period.periodEnd },
    });
  }
  return { status, used: period?.recoveriesCounted ?? null, limit: period?.recoveryLimit ?? null };
}

/** ¿Se ha alcanzado el límite de recuperaciones del periodo vigente? (Sin escribir nada.) */
export async function recoveryLimitReached(trx: Trx, ctx: PlanContext, now: Date): Promise<boolean> {
  if (!ctx.plan) return false;
  const period = await findPeriod(trx, ctx.companyId, now);
  return !!period && period.recoveriesCounted >= period.recoveryLimit;
}

/** Emails automáticos enviados hoy (día natural en la zona horaria de la empresa): todos los intentos. */
export async function automaticEmailsToday(trx: Trx, companyId: string, timezone: string, now: Date): Promise<number> {
  const p = localParts(now, timezone);
  const midnight = zonedTimeToUtc(p.year, p.month, p.day, 0, 0, timezone);
  const row = await trx
    .selectFrom('messageDeliveries')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('companyId', '=', companyId)
    .where('createdAt', '>=', midnight)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

export type UsageLevel = 'ok' | 'warning' | 'reached' | 'no_plan';

/** Consumo del plan para mostrarlo (solo lectura: no crea el periodo si aún no existe). */
export async function usageSummary(trx: Trx, companyId: string, now = new Date()) {
  const ctx = await loadPlanContext(trx, companyId, now);
  const row = await findPeriod(trx, companyId, now);
  const limit = row?.recoveryLimit ?? ctx.plan?.monthlyRecoveryLimit ?? 0;
  const used = row?.recoveriesCounted ?? 0;
  const level: UsageLevel = !ctx.hasAccess || !ctx.plan ? 'no_plan' : used >= limit ? 'reached' : used >= Math.ceil(limit * USAGE_WARNING_RATIO) ? 'warning' : 'ok';
  const events = await trx
    .selectFrom('recoveryEvents as e')
    .innerJoin('quotes as q', (j) => j.onRef('q.id', '=', 'e.quoteId').onRef('q.companyId', '=', 'e.companyId'))
    .innerJoin('contacts as c', (j) => j.onRef('c.id', '=', 'q.contactId').onRef('c.companyId', '=', 'q.companyId'))
    .select([
      'e.id',
      'e.quoteId',
      'q.title as quoteTitle',
      'q.reference as quoteReference',
      'c.fullName as contactName',
      'e.status',
      'e.responseStatus',
      'e.respondedAt',
      'e.registeredAt',
      'e.followUpChannel',
      'e.followUpSource',
      'e.followUpAt',
    ])
    .where('e.companyId', '=', companyId)
    .where('e.registeredAt', '>=', row?.periodStart ?? ctx.period.start)
    .where('e.registeredAt', '<', row?.periodEnd ?? ctx.period.end)
    .orderBy('e.registeredAt', 'desc')
    .limit(500)
    .execute();
  return {
    plan: ctx.plan,
    status: ctx.status,
    trialEndsAt: ctx.trialEndsAt,
    hasActiveAccess: ctx.hasAccess,
    period: {
      start: row?.periodStart ?? ctx.period.start,
      end: row?.periodEnd ?? ctx.period.end,
      source: (row?.periodSource ?? ctx.period.source) as BillingPeriod['source'],
      timezone: ctx.timezone,
    },
    recoveries: {
      used,
      limit,
      remaining: Math.max(limit - used, 0),
      overLimit: row?.recoveriesOverLimit ?? 0,
      warningAt: ctx.plan ? Math.ceil(limit * USAGE_WARNING_RATIO) : null,
      limitReachedAt: row?.limitReachedAt ?? null,
      level,
    },
    automaticEmails: {
      today: await automaticEmailsToday(trx, companyId, ctx.timezone, now),
      dailyLimit: ctx.plan?.dailyAutomaticEmailLimit ?? 0,
    },
    events,
  };
}

