import { sql } from 'kysely';
import type { AppConfig } from '../../config.js';
import { withTenant, type Db } from '../../db/database.js';
import type { RetentionStage, SubscriptionStatus } from '../../db/types.js';
import { accessEndedAt, dataRetentionUntil } from '../../domain/plans.js';
import type { Mailer } from '../../mail/mailer.js';
import { retentionNoticeEmail } from '../../mail/templates.js';
import { safeTimeZone } from './trial-reminders.js';

const DAY_MS = 86_400_000;

/** Avisos previos al plazo de conservación (decisión D1): a 30, 7 y 1 día. */
export function retentionStage(deadline: Date, now: Date): RetentionStage | null {
  const left = deadline.getTime() - now.getTime();
  if (left <= 0) return null; // plazo cumplido: lo revisa operación (no hay borrado automático)
  if (left <= DAY_MS) return '1_day';
  if (left <= 7 * DAY_MS) return '7_days';
  if (left <= 30 * DAY_MS) return '30_days';
  return null;
}

export interface RetentionCandidate {
  companyId: string;
  companyName: string;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  ownerEmails: string[];
  timezone: string;
  accessEndedAt: Date;
  deletionDueAt: Date;
}

/** Empresas sin plan activo, con la fecha a partir de la cual podrían borrarse sus datos. */
export async function retentionCandidates(db: Db, now = new Date()): Promise<RetentionCandidate[]> {
  const { rows } = await sql<Omit<RetentionCandidate, 'accessEndedAt' | 'deletionDueAt'>>`
    select company_id as "companyId", company_name as "companyName", status, trial_ends_at as "trialEndsAt",
           past_due_since as "pastDueSince", ended_at as "endedAt", created_at as "createdAt", owner_emails as "ownerEmails", timezone
    from app_retention_candidates()`.execute(db);
  const out: RetentionCandidate[] = [];
  for (const r of rows) {
    const ended = accessEndedAt(r, now);
    const due = dataRetentionUntil(ended);
    if (ended && due) out.push({ ...r, accessEndedAt: ended, deletionDueAt: due });
  }
  return out;
}

/**
 * Envía, como mucho una vez por etapa, el aviso de conservación a los propietarios de cada
 * cuenta sin plan activo. NO borra nada: el borrado es manual (npm run ops -- delete-company)
 * tras comprobar que no hay obligaciones legales de conservación (docs/facturacion.md).
 * Debe ejecutarse con el bloqueo exclusivo del trabajo de retención (automation/runner.ts).
 */
export async function sendRetentionNotices(deps: { db: Db; config: AppConfig; mailer: Mailer; now?: () => Date }) {
  const now = deps.now?.() ?? new Date();
  const stats = { candidates: 0, sent: 0, notConfigured: 0, failed: 0, pastDeadline: 0 };
  for (const c of await retentionCandidates(deps.db, now)) {
    stats.candidates++;
    if (c.deletionDueAt <= now) {
      stats.pastDeadline++;
      continue;
    }
    const stage = retentionStage(c.deletionDueAt, now);
    if (!stage) continue;
    // La fecha se escribe en la zona horaria de la empresa (antes: siempre Madrid).
    const dateFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: safeTimeZone(c.timezone) });
    await withTenant(deps.db, { companyId: c.companyId, userId: null }, async (trx) => {
      const already = await trx
        .selectFrom('retentionNotices')
        .select('id')
        .where('companyId', '=', c.companyId)
        .where('stage', '=', stage)
        .where('deletionDueAt', '=', c.deletionDueAt)
        .executeTakeFirst();
      if (already) return;
      let delivery: 'sent' | 'not_configured' | 'failed' | 'no_recipients' = c.ownerEmails.length ? 'sent' : 'no_recipients';
      for (const to of c.ownerEmails) {
        const result = await deps.mailer.send(retentionNoticeEmail(to, c.companyName, dateFormat.format(c.deletionDueAt), `${deps.config.appWebUrl}/configuracion/plan`));
        if (result.status === 'not_configured') delivery = 'not_configured';
        else if (result.status === 'failed' && delivery === 'sent') delivery = 'failed';
      }
      await trx
        .insertInto('retentionNotices')
        .values({ companyId: c.companyId, stage, deletionDueAt: c.deletionDueAt, delivery, recipients: c.ownerEmails.length })
        .onConflict((oc) => oc.doNothing())
        .execute();
      if (delivery === 'sent') stats.sent++;
      else if (delivery === 'not_configured') stats.notConfigured++;
      else stats.failed++;
    });
  }
  return stats;
}
