import { sql } from 'kysely';
import type { AppConfig } from '../../config.js';
import { withTenant, type Db } from '../../db/database.js';
import type { Mailer } from '../../mail/mailer.js';
import { trialReminderEmail } from '../../mail/templates.js';

const DAY_MS = 86_400_000;

/*
 * Avisos antes del fin de la prueba gratuita (P2-05). Distintos de los de conservación de
 * datos (retention.ts): estos llegan ANTES de perder el acceso, para poder elegir un plan.
 *  - Días configurables (TRIAL_REMINDER_DAYS, por defecto 3 y 1).
 *  - Como mucho un aviso por etapa y fecha de fin (trial_notices, restricción única; el trabajo
 *    de retención es exclusivo entre workers): repetirlo no duplica avisos.
 *  - Si el worker estuvo parado, solo se envía la etapa vigente (no se acumulan avisos).
 *  - No se avisa a quien ya contrató un plan ni a una prueba ya terminada.
 */

/** Etapa vigente: el menor número de días configurado que ya se ha alcanzado. */
export function trialReminderStage(trialEndsAt: Date, now: Date, days: number[]): { stage: string; days: number } | null {
  const left = trialEndsAt.getTime() - now.getTime();
  if (left <= 0) return null;
  const reached = [...days].sort((a, b) => a - b).find((d) => left <= d * DAY_MS);
  return reached ? { stage: reached === 1 ? '1_day' : `${reached}_days`, days: reached } : null;
}

export async function sendTrialReminders(deps: { db: Db; config: AppConfig; mailer: Mailer; now?: () => Date }) {
  const now = deps.now?.() ?? new Date();
  const stats = { candidates: 0, sent: 0, notConfigured: 0, failed: 0 };
  const days = deps.config.trialReminderDays;
  if (!days.length) return stats;
  const until = new Date(now.getTime() + Math.max(...days) * DAY_MS);
  const { rows } = await sql<{ companyId: string; companyName: string; timezone: string; trialEndsAt: Date; ownerEmails: string[] }>`
    select company_id as "companyId", company_name as "companyName", timezone, trial_ends_at as "trialEndsAt", owner_emails as "ownerEmails"
    from app_trial_reminder_candidates(${until})`.execute(deps.db);
  for (const c of rows) {
    const stage = trialReminderStage(c.trialEndsAt, now, days);
    if (!stage) continue;
    stats.candidates++;
    const dateFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: safeTimeZone(c.timezone) });
    await withTenant(deps.db, { companyId: c.companyId, userId: null }, async (trx) => {
      // El trabajo de retención corre con un bloqueo exclusivo (runner.ts): no hay dos a la vez.
      const already = await trx
        .selectFrom('trialNotices')
        .select('id')
        .where('companyId', '=', c.companyId)
        .where('stage', '=', stage.stage)
        .where('trialEndsAt', '=', c.trialEndsAt)
        .executeTakeFirst();
      if (already) return;
      let delivery: 'sent' | 'not_configured' | 'failed' | 'no_recipients' = c.ownerEmails.length ? 'sent' : 'no_recipients';
      for (const to of c.ownerEmails) {
        const result = await deps.mailer.send(trialReminderEmail(to, c.companyName, stage.days, dateFormat.format(c.trialEndsAt), `${deps.config.appWebUrl}/configuracion/plan`));
        if (result.status === 'not_configured') delivery = 'not_configured';
        else if (result.status === 'failed' && delivery === 'sent') delivery = 'failed';
      }
      await trx
        .insertInto('trialNotices')
        .values({ companyId: c.companyId, stage: stage.stage, trialEndsAt: c.trialEndsAt, delivery, recipients: c.ownerEmails.length })
        .onConflict((oc) => oc.doNothing())
        .execute();
      if (delivery === 'sent') stats.sent++;
      else if (delivery === 'not_configured') stats.notConfigured++;
      else stats.failed++;
    });
  }
  return stats;
}

/** Zona horaria de la empresa; si no es válida, Madrid. */
export function safeTimeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: tz });
    return tz;
  } catch {
    return 'Europe/Madrid';
  }
}
