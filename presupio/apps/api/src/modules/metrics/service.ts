import { sql } from 'kysely';
import { localParts, zonedTimeToUtc } from '../../automation/schedule.js';
import type { Trx } from '../../db/database.js';
import { RECOVERY_ATTRIBUTION_DAYS } from '../../domain/recovery.js';

/** Por debajo de este número de casos no se calcula ningún porcentaje. */
export const MIN_SAMPLE_FOR_RATE = 10;
const HISTORY_MONTHS = 6;

export interface MonthRange {
  month: string; // AAAA-MM
  start: Date;
  end: Date;
}

export function monthRange(year: number, month: number, timezone: string): MonthRange {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    month: `${year}-${String(month).padStart(2, '0')}`,
    start: zonedTimeToUtc(year, month, 1, 0, 0, timezone),
    end: zonedTimeToUtc(nextYear, nextMonth, 1, 0, 0, timezone),
  };
}

export function currentMonth(now: Date, timezone: string): { year: number; month: number } {
  const p = localParts(now, timezone);
  return { year: p.year, month: p.month };
}

function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

const n = (v: unknown) => Number(v ?? 0);

/**
 * Métricas de un mes natural (zona horaria de la empresa). Todo sale de consultas a los datos
 * guardados; nada se estima. Respuesta tras seguimiento es una correlación temporal, no una
 * prueba de que el seguimiento la causara.
 */
export async function companyMetrics(trx: Trx, companyId: string, year: number, month: number, now = new Date()) {
  const company = await trx.selectFrom('companies').select(['timezone', 'createdAt']).where('id', '=', companyId).executeTakeFirstOrThrow();
  const tz = company.timezone;
  const range = monthRange(year, month, tz);
  const { start, end } = range;

  const quotes = await trx
    .selectFrom('quotes')
    .select([
      sql<string>`count(*) filter (where created_at >= ${start} and created_at < ${end})`.as('registered'),
      sql<string>`count(*) filter (where sent_at >= ${start} and sent_at < ${end})`.as('sent'),
      sql<string>`count(*) filter (where status = 'sent' and archived_at is null)`.as('pendingNow'),
      sql<string>`count(*) filter (where responded_at >= ${start} and responded_at < ${end})`.as('responded'),
      sql<string>`count(*) filter (where responded_at >= ${start} and responded_at < ${end} and reactivated_at is null)`.as('respondedWithoutFollowUp'),
      sql<string>`count(*) filter (where status = 'accepted' and accepted_at >= ${start} and accepted_at < ${end})`.as('accepted'),
      sql<string>`count(*) filter (where status = 'accepted' and accepted_at >= ${start} and accepted_at < ${end} and reactivated_at is not null)`.as(
        'acceptedAfterFollowUp',
      ),
      sql<string | null>`sum(accepted_amount_cents) filter (where status = 'accepted' and accepted_at >= ${start} and accepted_at < ${end} and reactivated_at is not null)`.as(
        'acceptedAfterFollowUpAmountCents',
      ),
    ])
    .where('companyId', '=', companyId)
    .executeTakeFirstOrThrow();

  const followUps = await trx
    .selectFrom('followUps')
    .select([
      sql<string>`count(*) filter (where source = 'rule' and status = 'pending')`.as('automaticScheduledNow'),
      sql<string>`count(*) filter (where source = 'rule' and status = 'pending' and approved_at is null)`.as('automaticAwaitingApprovalNow'),
      sql<string>`count(*) filter (where source = 'rule' and status = 'sent' and sent_at >= ${start} and sent_at < ${end})`.as('automaticSent'),
      sql<string>`count(*) filter (where status = 'completed' and channel <> 'task' and completed_at >= ${start} and completed_at < ${end})`.as('manualContacts'),
      sql<string>`count(*) filter (where status = 'pending' and source = 'manual')`.as('manualPendingNow'),
    ])
    .where('companyId', '=', companyId)
    .executeTakeFirstOrThrow();

  const deliveries = await trx
    .selectFrom('messageDeliveries')
    .select([
      sql<string>`count(*) filter (where delivered_at >= ${start} and delivered_at < ${end})`.as('delivered'),
      sql<string>`count(*) filter (where status in ('failed', 'unknown') and created_at >= ${start} and created_at < ${end})`.as('failedAttempts'),
    ])
    .where('companyId', '=', companyId)
    .executeTakeFirstOrThrow();

  const failedEmails = await trx
    .selectFrom('followUps')
    .select(sql<string>`count(*)`.as('n'))
    .where('companyId', '=', companyId)
    .where('source', '=', 'rule')
    .where('status', '=', 'failed')
    .where('updatedAt', '>=', start)
    .where('updatedAt', '<', end)
    .executeTakeFirstOrThrow();

  const recoveries = await trx
    .selectFrom('recoveryEvents')
    .select([
      sql<string>`count(*) filter (where responded_at >= ${start} and responded_at < ${end})`.as('respondedAfterFollowUp'),
      sql<string>`count(*) filter (where responded_at >= ${start} and responded_at < ${end} and follow_up_source = 'rule')`.as('afterAutomatic'),
      // Recuperaciones registradas en el mes (métrica de resultados; no consumen el plan).
      sql<string>`count(*) filter (where registered_at >= ${start} and registered_at < ${end} and status <> 'historical')`.as('recorded'),
    ])
    .where('companyId', '=', companyId)
    .executeTakeFirstOrThrow();

  // Intentos de seguimiento contados en el mes (unidad de consumo del plan).
  const attempts = await trx
    .selectFrom('attemptEvents')
    .select(sql<string>`count(*) filter (where status = 'counted' and sent_at >= ${start} and sent_at < ${end})`.as('counted'))
    .where('companyId', '=', companyId)
    .executeTakeFirstOrThrow();

  // Cohorte: presupuestos con al menos un seguimiento realizado este mes, y cuántos de ellos
  // respondieron después de un seguimiento de este mes (en la ventana de atribución).
  const cohort = await sql<{ withFollowUp: string; responded: string }>`
    with done as (
      select distinct quote_id from follow_ups
      where company_id = ${companyId} and channel <> 'task'
        and ((status = 'completed' and completed_at >= ${start} and completed_at < ${end})
          or (status = 'sent' and sent_at >= ${start} and sent_at < ${end}))
    )
    select
      (select count(*) from done) as "withFollowUp",
      (select count(*) from recovery_events e join done d on d.quote_id = e.quote_id
        where e.company_id = ${companyId} and e.follow_up_at >= ${start} and e.follow_up_at < ${end}) as "responded"`.execute(trx);
  const withFollowUp = n(cohort.rows[0]?.withFollowUp);
  const respondedInCohort = n(cohort.rows[0]?.responded);
  const cohortClosesAt = new Date(end.getTime() + RECOVERY_ATTRIBUTION_DAYS * 86_400_000);

  return {
    period: {
      month: range.month,
      start,
      end,
      timezone: tz,
      inProgress: now < end,
      beforeAccountCreated: end <= company.createdAt,
    },
    quotes: {
      registered: n(quotes.registered),
      sent: n(quotes.sent),
      pendingNow: n(quotes.pendingNow),
    },
    followUps: {
      automaticScheduledNow: n(followUps.automaticScheduledNow),
      automaticAwaitingApprovalNow: n(followUps.automaticAwaitingApprovalNow),
      automaticSent: n(followUps.automaticSent),
      automaticDelivered: n(deliveries.delivered),
      automaticFailed: n(failedEmails.n),
      failedAttempts: n(deliveries.failedAttempts),
      manualContacts: n(followUps.manualContacts),
      manualPendingNow: n(followUps.manualPendingNow),
    },
    outcomes: {
      responded: n(quotes.responded),
      respondedAfterFollowUp: n(recoveries.respondedAfterFollowUp),
      respondedAfterAutomaticEmail: n(recoveries.afterAutomatic),
      respondedWithoutFollowUp: n(quotes.respondedWithoutFollowUp),
      accepted: n(quotes.accepted),
      acceptedAfterFollowUp: n(quotes.acceptedAfterFollowUp),
      acceptedAfterFollowUpAmountCents: n(quotes.acceptedAfterFollowUpAmountCents),
      amountSource: 'declared_by_company' as const,
    },
    // Consumo (intentos) y resultados (recuperaciones) por separado: no son lo mismo.
    attempts: { counted: n(attempts.counted) },
    recoveries: { recorded: n(recoveries.recorded) },
    responseRate: {
      quotesWithFollowUp: withFollowUp,
      respondedAfterFollowUp: respondedInCohort,
      // Sin muestra suficiente no se da porcentaje.
      rate: withFollowUp >= MIN_SAMPLE_FOR_RATE ? respondedInCohort / withFollowUp : null,
      minSample: MIN_SAMPLE_FOR_RATE,
      // Hasta esta fecha aún pueden llegar respuestas atribuibles a seguimientos del mes.
      finalAfter: cohortClosesAt,
      final: now >= cohortClosesAt,
    },
  };
}

/** Evolución de los últimos meses (meses naturales en la zona horaria de la empresa). */
export async function metricsHistory(trx: Trx, companyId: string, year: number, month: number) {
  const company = await trx.selectFrom('companies').select('timezone').where('id', '=', companyId).executeTakeFirstOrThrow();
  const tz = company.timezone;
  const first = shiftMonth(year, month, -(HISTORY_MONTHS - 1));
  const from = monthRange(first.year, first.month, tz).start;
  const to = monthRange(year, month, tz).end;
  const bucket = (column: string) => sql<string>`to_char(${sql.ref(column)} at time zone ${tz}, 'YYYY-MM')`;

  // Consulta sobre una tabla y columna elegidas en tiempo de ejecución (Kysely no puede tiparla).
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const series = async (table: 'quotes' | 'followUps' | 'recoveryEvents' | 'attemptEvents', column: string, extra: (qb: any) => any) => {
    const rows = await extra(
      trx
        .selectFrom(table)
        .select([bucket(column).as('month'), sql<string>`count(*)`.as('n')])
        .where('companyId', '=', companyId)
        .where(sql.ref(column) as any, '>=', from)
        .where(sql.ref(column) as any, '<', to),
    )
      .groupBy(sql`1`)
      .execute();
    return new Map<string, number>(rows.map((r: { month: string; n: string }) => [r.month, Number(r.n)]));
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const sent = await series('quotes', 'sent_at', (q) => q);
  const manual = await series('followUps', 'completed_at', (q) => q.where('status', '=', 'completed').where('channel', '<>', 'task'));
  const automatic = await series('followUps', 'sent_at', (q) => q.where('status', '=', 'sent').where('source', '=', 'rule'));
  const responded = await series('recoveryEvents', 'responded_at', (q) => q);
  const accepted = await series('quotes', 'accepted_at', (q) => q.where('status', '=', 'accepted').where('reactivatedAt', 'is not', null));
  const attempts = await series('attemptEvents', 'sent_at', (q) => q.where('status', '=', 'counted'));

  return Array.from({ length: HISTORY_MONTHS }, (_, i) => {
    const m = shiftMonth(first.year, first.month, i);
    const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
    return {
      month: key,
      quotesSent: sent.get(key) ?? 0,
      followUpsDone: (manual.get(key) ?? 0) + (automatic.get(key) ?? 0),
      respondedAfterFollowUp: responded.get(key) ?? 0,
      acceptedAfterFollowUp: accepted.get(key) ?? 0,
      attemptsCounted: attempts.get(key) ?? 0,
    };
  });
}
