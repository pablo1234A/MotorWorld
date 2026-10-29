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
    .select(['s.plan', 's.status', 's.trialEndsAt', 's.pastDueSince', 's.currentPeriodStart', 's.currentPeriodEnd', 'c.timezone'])
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
 * límite de intentos sube en el acto; una bajada se aplica desde el periodo siguiente.
 */
export async function ensureUsagePeriod(trx: Trx, ctx: PlanContext, now: Date): Promise<UsagePeriod> {
  const limit = ctx.plan?.monthlyAttemptLimit ?? 0;
  const existing = await findPeriod(trx, ctx.companyId, now);
  if (existing) {
    if (limit > existing.attemptLimit) {
      return trx
        .updateTable('usagePeriods')
        .set({ attemptLimit: limit, plan: ctx.plan?.id ?? null })
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
      // Las recuperaciones ya no consumen el plan (desde la migración 0005).
      recoveryLimit: 0,
      attemptLimit: limit,
      limitReachedAt: null,
      attemptsLimitReachedAt: null,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
  return (await findPeriod(trx, ctx.companyId, now))!;
}

// ---------------------------------------------------------------------------
// Intentos: la unidad de consumo de los planes
// ---------------------------------------------------------------------------

/**
 * Cupo de intentos que queda en el periodo vigente: límite − contados − reservados (envíos en
 * curso). Crea el periodo si hace falta. Sin acceso activo o sin plan, el cupo es 0.
 * Llamar con el bloqueo de envío de la empresa tomado (engine.dispatchCompany).
 */
export async function attemptCapacity(trx: Trx, ctx: PlanContext, now: Date): Promise<{ period: UsagePeriod | null; available: number }> {
  if (!ctx.hasAccess || !ctx.plan) return { period: null, available: 0 };
  const period = await ensureUsagePeriod(trx, ctx, now);
  return { period, available: Math.max(period.attemptLimit - period.attemptsCounted - period.attemptsReserved, 0) };
}

/** ¿Se han contado ya todos los intentos del periodo vigente? (Sin escribir nada.) */
export async function attemptLimitReached(trx: Trx, ctx: PlanContext, now: Date): Promise<boolean> {
  if (!ctx.plan) return false;
  const period = await findPeriod(trx, ctx.companyId, now);
  return !!period && period.attemptsCounted >= period.attemptLimit;
}

/**
 * Reserva el intento de un seguimiento antes de enviarlo. Es idempotente por seguimiento:
 * un reintento técnico vuelve a reservar el MISMO intento (no crea otro). La sentencia sobre
 * el periodo es condicional y la base de datos impide superar el límite (CHECK).
 */
export async function reserveAttempt(
  trx: Trx,
  companyId: string,
  period: UsagePeriod,
  followUp: { id: string; quoteId: string },
  now: Date,
): Promise<boolean> {
  const updated = await trx
    .updateTable('usagePeriods')
    .set({ attemptsReserved: sql`attempts_reserved + 1` })
    .where('companyId', '=', companyId)
    .where('periodStart', '=', period.periodStart)
    .where(sql<boolean>`attempts_counted + attempts_reserved < attempt_limit`)
    .returning('periodStart')
    .executeTakeFirst();
  if (!updated) return false;
  const existing = await trx
    .selectFrom('attemptEvents')
    .select(['id', 'status'])
    .where('companyId', '=', companyId)
    .where('followUpId', '=', followUp.id)
    .forUpdate()
    .executeTakeFirst();
  if (!existing) {
    await trx
      .insertInto('attemptEvents')
      .values({
        companyId,
        followUpId: followUp.id,
        quoteId: followUp.quoteId,
        deliveryId: null,
        status: 'reserved',
        periodStart: period.periodStart,
        reservedAt: now,
        sentAt: null,
        releasedAt: null,
        releaseReason: null,
      })
      .execute();
    return true;
  }
  if (existing.status !== 'released') {
    // Ya reservado o contado: no se puede volver a reservar (lo impide también el disparador).
    throw new Error(`Intento en estado ${existing.status}: no se puede reservar de nuevo`);
  }
  await trx
    .updateTable('attemptEvents')
    .set({ status: 'reserved', periodStart: period.periodStart, reservedAt: now, releasedAt: null, releaseReason: null })
    .where('companyId', '=', companyId)
    .where('id', '=', existing.id)
    .execute();
  return true;
}

/**
 * El proveedor aceptó el email: el intento pasa de reservado a contado en el periodo en que
 * se reservó. Devuelve el periodo actualizado (o null si no había reserva).
 */
export async function confirmAttempt(
  trx: Trx,
  companyId: string,
  followUpId: string,
  deliveryId: string,
  at: Date,
): Promise<UsagePeriod | null> {
  const attempt = await trx
    .updateTable('attemptEvents')
    .set({ status: 'counted', sentAt: at, deliveryId })
    .where('companyId', '=', companyId)
    .where('followUpId', '=', followUpId)
    .where('status', '=', 'reserved')
    .returning('periodStart')
    .executeTakeFirst();
  if (!attempt?.periodStart) return null;
  const period = await trx
    .updateTable('usagePeriods')
    .set({
      attemptsReserved: sql`attempts_reserved - 1`,
      attemptsCounted: sql`attempts_counted + 1`,
      attemptsLimitReachedAt: sql`CASE WHEN attempts_counted + 1 >= attempt_limit THEN coalesce(attempts_limit_reached_at, now()) ELSE attempts_limit_reached_at END`,
    })
    .where('companyId', '=', companyId)
    .where('periodStart', '=', attempt.periodStart)
    .returningAll()
    .executeTakeFirstOrThrow();
  return period;
}

/**
 * El envío no llegó a realizarse (fallo antes de enviar) → «released»: no consume y puede
 * volver a reservarse en un reintento. Resultado desconocido → «unverified»: no se cobra y no
 * se reintenta (para no arriesgar un duplicado).
 */
export async function releaseAttempt(
  trx: Trx,
  companyId: string,
  followUpId: string,
  status: 'released' | 'unverified',
  reason: string,
  deliveryId: string | null,
  at: Date,
): Promise<void> {
  const attempt = await trx
    .updateTable('attemptEvents')
    .set({ status, releasedAt: at, releaseReason: reason.slice(0, 200), ...(deliveryId ? { deliveryId } : {}) })
    .where('companyId', '=', companyId)
    .where('followUpId', '=', followUpId)
    .where('status', '=', 'reserved')
    .returning('periodStart')
    .executeTakeFirst();
  if (!attempt?.periodStart) return;
  await trx
    .updateTable('usagePeriods')
    .set({ attemptsReserved: sql`attempts_reserved - 1` })
    .where('companyId', '=', companyId)
    .where('periodStart', '=', attempt.periodStart)
    .execute();
}

// ---------------------------------------------------------------------------
// Recuperaciones: métrica de resultados (no consumen el plan)
// ---------------------------------------------------------------------------

export interface RecoveryInput {
  quoteId: string;
  respondedAt: Date;
  responseStatus: 'responded' | 'accepted';
  followUp: { id: string; source: FollowUpSource; channel: FollowUpChannel; at: Date };
}

/**
 * Registra una recuperación (una vez por presupuesto) como dato de resultados. Desde la fase
 * 5 no descuenta nada del plan: el consumo se mide en intentos de envío, con la hora del
 * servidor, así que ninguna fecha declarada por la empresa puede alterarlo.
 */
export async function recordRecovery(
  trx: Trx,
  ctx: { companyId: string; userId: string | null },
  input: RecoveryInput,
): Promise<{ status: 'recorded' } | null> {
  const inserted = await trx
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
      status: 'recorded',
      periodStart: null,
    })
    // Una sola vez por presupuesto, también con peticiones simultáneas.
    .onConflict((oc) => oc.columns(['companyId', 'quoteId']).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (!inserted) return null;
  await logActivity(trx, ctx, {
    action: 'recovery.registered',
    entityType: 'quote',
    entityId: input.quoteId,
    quoteId: input.quoteId,
    metadata: { status: 'recorded', followUpChannel: input.followUp.channel, automatic: input.followUp.source === 'rule' },
  });
  return { status: 'recorded' };
}

/** Emails automáticos enviados hoy (día natural en la zona horaria de la empresa): todos los envíos técnicos. */
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
  const limit = row?.attemptLimit ?? ctx.plan?.monthlyAttemptLimit ?? 0;
  const used = row?.attemptsCounted ?? 0;
  const reserved = row?.attemptsReserved ?? 0;
  const level: UsageLevel = !ctx.hasAccess || !ctx.plan ? 'no_plan' : used >= limit ? 'reached' : used >= Math.ceil(limit * USAGE_WARNING_RATIO) ? 'warning' : 'ok';
  const start = row?.periodStart ?? ctx.period.start;
  const end = row?.periodEnd ?? ctx.period.end;
  const events = row
    ? await trx
        .selectFrom('attemptEvents as a')
        .innerJoin('quotes as q', (j) => j.onRef('q.id', '=', 'a.quoteId').onRef('q.companyId', '=', 'a.companyId'))
        .innerJoin('contacts as c', (j) => j.onRef('c.id', '=', 'q.contactId').onRef('c.companyId', '=', 'q.companyId'))
        .innerJoin('followUps as f', (j) => j.onRef('f.id', '=', 'a.followUpId').onRef('f.companyId', '=', 'a.companyId'))
        .select(['a.id', 'a.quoteId', 'q.title as quoteTitle', 'q.reference as quoteReference', 'c.fullName as contactName', 'a.status', 'a.sentAt', 'a.reservedAt', 'f.sequenceStep as step'])
        .where('a.companyId', '=', companyId)
        .where('a.periodStart', '=', row.periodStart)
        .where('a.status', 'in', ['counted', 'reserved'])
        .orderBy(sql`coalesce(a.sent_at, a.reserved_at)`, 'desc')
        .limit(500)
        .execute()
    : [];
  const recoveries = await trx
    .selectFrom('recoveryEvents')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('companyId', '=', companyId)
    .where('registeredAt', '>=', start)
    .where('registeredAt', '<', end)
    .where('status', '<>', 'historical')
    .executeTakeFirstOrThrow();
  return {
    plan: ctx.plan,
    status: ctx.status,
    trialEndsAt: ctx.trialEndsAt,
    hasActiveAccess: ctx.hasAccess,
    period: { start, end, source: (row?.periodSource ?? ctx.period.source) as BillingPeriod['source'], timezone: ctx.timezone },
    attempts: {
      used,
      inProgress: reserved,
      limit,
      remaining: Math.max(limit - used - reserved, 0),
      warningAt: ctx.plan ? Math.ceil(limit * USAGE_WARNING_RATIO) : null,
      limitReachedAt: row?.attemptsLimitReachedAt ?? null,
      level,
    },
    automaticEmails: {
      today: await automaticEmailsToday(trx, companyId, ctx.timezone, now),
      dailyLimit: ctx.plan?.dailyAutomaticEmailLimit ?? 0,
    },
    // Dato informativo: respuestas tras un seguimiento registradas en el periodo (no consumen).
    recoveriesRecorded: Number(recoveries.n),
    events,
  };
}
