import { sql } from 'kysely';
import {
  applyRetention,
  automationCompanyIds,
  dispatchCompany,
  planCompany,
  recoverStuckDeliveries,
  type EngineDeps,
} from './engine.js';
import type { Mailer } from '../mail/mailer.js';
import { reconcileUnknownDeliveries } from './unknown.js';
import { sendRetentionNotices } from '../modules/billing/retention.js';

// Claves de bloqueo consultivo de PostgreSQL (una por trabajo exclusivo).
const LOCKS = { planner: 72_001, retention: 72_002, recovery: 72_003 } as const;

interface Logger {
  info(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** Registra la ejecución de un trabajo (supervisión básica: GET /automation y job_runs). */
async function recordRun<T extends object>(deps: EngineDeps, job: string, fn: () => Promise<T>): Promise<T | null> {
  const run = await deps.db.insertInto('jobRuns').values({ job, status: 'running', stats: '{}', finishedAt: null, error: null }).returning('id').executeTakeFirstOrThrow();
  try {
    const stats = await fn();
    await deps.db.updateTable('jobRuns').set({ status: 'ok', finishedAt: new Date(), stats: JSON.stringify(stats) }).where('id', '=', run.id).execute();
    return stats;
  } catch (error) {
    await deps.db
      .updateTable('jobRuns')
      .set({ status: 'error', finishedAt: new Date(), error: String((error as Error).message ?? error).slice(0, 500) })
      .where('id', '=', run.id)
      .execute();
    throw error;
  }
}

/** Ejecuta `fn` solo si este proceso obtiene el bloqueo; si no, otro proceso ya lo está haciendo. */
async function exclusive<T>(deps: EngineDeps, key: number, fn: () => Promise<T>): Promise<T | 'locked'> {
  return deps.db.connection().execute(async (conn) => {
    const { rows } = await sql<{ locked: boolean }>`select pg_try_advisory_lock(${key}) as locked`.execute(conn);
    if (!rows[0]?.locked) return 'locked' as const;
    try {
      return await fn();
    } finally {
      await sql`select pg_advisory_unlock(${key})`.execute(conn);
    }
  });
}

export interface CycleResult {
  recovered: number | 'locked';
  planned: Record<string, unknown> | 'locked';
  dispatched: Record<string, number>;
  retention?: Record<string, number> | 'locked';
}

/**
 * Un ciclo completo del motor. Es seguro ejecutarlo varias veces a la vez (varios procesos o
 * reinicios): la planificación es exclusiva y el envío reclama cada paso con SKIP LOCKED.
 */
export async function runCycle(deps: EngineDeps, options: { retention?: boolean; logger?: Logger; mailer?: Mailer } = {}): Promise<CycleResult> {
  const result: CycleResult = { recovered: 0, planned: {}, dispatched: {} };

  result.recovered = await exclusive(deps, LOCKS.recovery, async () =>
    (await recordRun(deps, 'recovery', async () => {
      const recovered = await recoverStuckDeliveries(deps);
      // Envíos de resultado desconocido: se consultan al proveedor si lo permite (Mailgun).
      const reconciled = await reconcileUnknownDeliveries(deps);
      return { recovered, unknownChecked: reconciled.checked, unknownConfirmedSent: reconciled.sent, unknownConfirmedNotSent: reconciled.notSent };
    }))!.recovered,
  );

  const companies = await automationCompanyIds(deps.db);

  result.planned = await exclusive(deps, LOCKS.planner, async () => {
    return (await recordRun(deps, 'planner', async () => {
      const totals = { companies: companies.length, scheduled: 0, rescheduled: 0, cancelled: 0, errors: 0 };
      for (const id of companies) {
        try {
          const s = await planCompany(deps, id);
          totals.scheduled += s.scheduled;
          totals.rescheduled += s.rescheduled;
          totals.cancelled += s.cancelled;
        } catch (error) {
          // El fallo de una empresa no detiene a las demás.
          totals.errors++;
          options.logger?.error({ companyId: id, err: (error as Error).message }, 'Error al planificar');
        }
      }
      return totals;
    }))!;
  });

  const dispatched = (await recordRun(deps, 'dispatcher', async () => {
    const totals = { companies: companies.length, claimed: 0, sent: 0, failed: 0, retried: 0, cancelled: 0, waiting: 0, errors: 0 };
    for (const id of companies) {
      try {
        const s = await dispatchCompany(deps, id);
        for (const k of ['claimed', 'sent', 'failed', 'retried', 'cancelled', 'waiting'] as const) totals[k] += s[k];
      } catch (error) {
        totals.errors++;
        options.logger?.error({ companyId: id, err: (error as Error).message }, 'Error al enviar');
      }
    }
    return totals;
  }))!;
  result.dispatched = dispatched;

  if (options.retention) {
    result.retention = await exclusive(deps, LOCKS.retention, async () =>
      (await recordRun(deps, 'retention', async () => {
        const purged = await applyRetention(deps);
        // Avisos de conservación de datos a cuentas sin plan activo (no borra nada).
        const notices = options.mailer ? await sendRetentionNotices({ db: deps.db, config: deps.config, mailer: options.mailer, now: deps.now }) : null;
        return { ...purged, ...(notices ? { retentionNoticesSent: notices.sent, retentionNoticesNotConfigured: notices.notConfigured, retentionPastDeadline: notices.pastDeadline } : {}) };
      }))!,
    );
  }
  return result;
}
