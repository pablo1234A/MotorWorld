import { sql } from 'kysely';
import type { AppConfig } from '../config.js';
import { setTenant, withTenant, type Db, type Trx } from '../db/database.js';
import type { Contact, FollowUp, Quote, TemplateVersion } from '../db/types.js';
import { hasActiveAccess } from '../domain/plans.js';
import { generateToken, hashToken } from '../lib/crypto.js';
import { logActivity } from '../modules/activity/service.js';
import { hasEmailExclusion } from '../modules/exclusions/service.js';
import {
  attemptCapacity,
  attemptLimitReached,
  automaticEmailsToday,
  confirmAttempt,
  loadPlanContext,
  releaseAttempt,
  reserveAttempt,
} from '../modules/usage/service.js';
import type { FollowUpEmailProvider } from './providers.js';
import { localDaysBetween, nextAllowedSlot, stepDueAt, type ContactRules } from './schedule.js';
import { composeMessage, defaultTemplate, renderBody, type Sender, type TemplateValues } from './templates.js';

/** Días de margen tras el último paso: después, el presupuesto queda fuera de secuencia. */
const STALE_AFTER_LAST_STEP_DAYS = 7;
const SYSTEM = (companyId: string) => ({ companyId, userId: null });

export interface EngineDeps {
  db: Db;
  config: AppConfig;
  provider: FollowUpEmailProvider;
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// Contexto de la empresa
// ---------------------------------------------------------------------------

export interface CompanyContext {
  companyId: string;
  rules: ContactRules;
  schedule: number[];
  automationEnabled: boolean;
  requireApproval: boolean;
  replyTo: string | null;
  senderName: string | null;
  sender: Sender;
  hasAccess: boolean;
  /** Se han contado todos los intentos del plan en el periodo vigente. */
  attemptLimitReached: boolean;
  /** Límite técnico de emails automáticos por día (zona horaria de la empresa). */
  dailyEmailLimit: number;
}

export async function loadCompanyContext(trx: Trx, companyId: string, now: Date): Promise<CompanyContext> {
  const row = await trx
    .selectFrom('companySettings as s')
    .innerJoin('companies as c', 'c.id', 's.companyId')
    .innerJoin('subscriptions as sub', 'sub.companyId', 's.companyId')
    .select([
      's.followUpScheduleDays',
      's.allowedWeekdays',
      's.contactWindowStart',
      's.contactWindowEnd',
      's.automationEnabled',
      's.requireManualApproval',
      's.replyToEmail',
      's.senderName',
      'c.name',
      'c.legalName',
      'c.taxId',
      'c.timezone',
      'sub.status',
      'sub.trialEndsAt',
      'sub.pastDueSince',
    ])
    .where('s.companyId', '=', companyId)
    .executeTakeFirstOrThrow();
  return {
    companyId,
    rules: {
      timezone: row.timezone,
      allowedWeekdays: row.allowedWeekdays,
      windowStart: row.contactWindowStart,
      windowEnd: row.contactWindowEnd,
    },
    schedule: row.followUpScheduleDays,
    automationEnabled: row.automationEnabled,
    requireApproval: row.requireManualApproval,
    replyTo: row.replyToEmail,
    senderName: row.senderName,
    sender: { companyName: row.name, legalName: row.legalName, taxId: row.taxId },
    hasAccess: hasActiveAccess({ status: row.status, trialEndsAt: row.trialEndsAt, pastDueSince: row.pastDueSince }, now),
    ...(await planLimits(trx, companyId, now)),
  };
}

async function planLimits(trx: Trx, companyId: string, now: Date) {
  const plan = await loadPlanContext(trx, companyId, now);
  return {
    attemptLimitReached: await attemptLimitReached(trx, plan, now),
    dailyEmailLimit: plan.plan?.dailyAutomaticEmailLimit ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

/** Última versión de la plantilla de un paso; si no existe, crea la versión 1 por defecto. */
export async function currentTemplate(trx: Trx, companyId: string, step: number, userId: string | null = null): Promise<TemplateVersion> {
  const existing = await trx
    .selectFrom('messageTemplateVersions')
    .selectAll()
    .where('companyId', '=', companyId)
    .where('step', '=', step)
    .orderBy('version', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (existing) return existing;
  const def = defaultTemplate(step);
  await trx
    .insertInto('messageTemplateVersions')
    .values({ companyId, step, version: 1, subject: def.subject, body: def.body, createdByUserId: userId })
    .onConflict((oc) => oc.doNothing())
    .execute();
  return trx
    .selectFrom('messageTemplateVersions')
    .selectAll()
    .where('companyId', '=', companyId)
    .where('step', '=', step)
    .orderBy('version', 'desc')
    .limit(1)
    .executeTakeFirstOrThrow();
}

export function templateValues(ctx: CompanyContext, quote: Pick<Quote, 'title' | 'reference' | 'sentAt'>, contact: Pick<Contact, 'fullName'>): TemplateValues {
  return {
    nombre_cliente: contact.fullName,
    titulo_presupuesto: quote.title,
    referencia: quote.reference ?? '',
    fecha_envio: quote.sentAt
      ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: ctx.rules.timezone }).format(quote.sentAt)
      : '',
    empresa: ctx.sender.companyName,
    remitente: ctx.senderName ?? ctx.sender.companyName,
  };
}

// ---------------------------------------------------------------------------
// Reglas de elegibilidad (se aplican al planificar y otra vez justo antes de enviar)
// ---------------------------------------------------------------------------

export type Verdict =
  | { ok: true }
  | { ok: false; action: 'cancel'; reason: string }
  | { ok: false; action: 'wait'; reason: string; until?: Date };

export async function baseEligibility(
  trx: Trx,
  ctx: CompanyContext,
  provider: FollowUpEmailProvider,
  quote: Quote,
  contact: Contact,
  step: number,
): Promise<Verdict> {
  if (!ctx.automationEnabled) return { ok: false, action: 'cancel', reason: 'automation_disabled' };
  if (!provider.configured) return { ok: false, action: 'wait', reason: 'provider_not_configured' };
  // Sin plan activo (fin de la prueba, impago, cancelación): la cuenta queda en solo lectura y
  // lo programado se cancela; nada sale hasta que vuelva a haber un plan activo.
  if (!ctx.hasAccess) return { ok: false, action: 'cancel', reason: 'no_active_plan' };
  // Intentos del plan agotados: no sale nada más hasta el periodo siguiente.
  if (ctx.attemptLimitReached) return { ok: false, action: 'cancel', reason: 'plan_limit_reached' };
  if (quote.archivedAt) return { ok: false, action: 'cancel', reason: 'quote_archived' };
  if (quote.status !== 'sent' || !quote.sentAt) return { ok: false, action: 'cancel', reason: `quote_${quote.status}` };
  if (!quote.autoFollowUpEnabled) return { ok: false, action: 'cancel', reason: 'quote_auto_disabled' };
  if (step > ctx.schedule.length) return { ok: false, action: 'cancel', reason: 'rules_changed' };
  if (!contact.email) return { ok: false, action: 'cancel', reason: 'contact_without_email' };
  if (await hasEmailExclusion(trx, ctx.companyId, contact)) return { ok: false, action: 'cancel', reason: 'contact_excluded' };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Planificador: programa el siguiente paso de cada presupuesto pendiente
// ---------------------------------------------------------------------------

export interface PlanStats {
  scheduled: number;
  rescheduled: number;
  cancelled: number;
}

export async function planCompany(deps: EngineDeps, companyId: string): Promise<PlanStats> {
  const now = deps.now?.() ?? new Date();
  const stats: PlanStats = { scheduled: 0, rescheduled: 0, cancelled: 0 };
  await withTenant(deps.db, SYSTEM(companyId), async (trx) => {
    const ctx = await loadCompanyContext(trx, companyId, now);
    if (!ctx.automationEnabled || !deps.provider.configured) return;
    if (!ctx.hasAccess) {
      // Sin plan activo: se detienen los envíos programados (decisión D1, solo lectura).
      stats.cancelled += await cancelPendingRuleSteps(trx, companyId, 'no_active_plan');
      return;
    }
    if (ctx.attemptLimitReached) {
      // Intentos del plan agotados: se cancelan los emails automáticos pendientes y no se
      // programan nuevos hasta el periodo siguiente (docs/limites-y-metricas.md).
      stats.cancelled += await cancelPendingRuleSteps(trx, companyId, 'plan_limit_reached');
      return;
    }

    // 1) Revisar los pasos pendientes (no aprobados) frente a las reglas actuales.
    const pending = await trx
      .selectFrom('followUps as f')
      .innerJoin('quotes as q', (j) => j.onRef('q.id', '=', 'f.quoteId').onRef('q.companyId', '=', 'f.companyId'))
      .select(['f.id', 'f.sequenceStep', 'f.sequenceKey', 'f.dueAt', 'f.approvedAt', 'q.sentAt', 'q.id as quoteId'])
      .where('f.companyId', '=', companyId)
      .where('f.source', '=', 'rule')
      .where('f.status', '=', 'pending')
      .execute();
    for (const p of pending) {
      const step = p.sequenceStep!;
      const stale = !p.sentAt || p.sequenceKey !== p.sentAt.toISOString();
      if (stale || step > ctx.schedule.length) {
        await cancelFollowUp(trx, companyId, p.id, p.quoteId, stale ? 'quote_resent' : 'rules_changed');
        stats.cancelled++;
        continue;
      }
      if (p.approvedAt) continue; // lo aprobado no se mueve
      let due = stepDueAt(p.sentAt!, ctx.schedule[step - 1]!, ctx.rules);
      if (due && due < now) due = nextAllowedSlot(now, ctx.rules);
      if (due && p.dueAt && Math.abs(due.getTime() - p.dueAt.getTime()) > 60_000 && p.dueAt > now) {
        await trx.updateTable('followUps').set({ dueAt: due }).where('companyId', '=', companyId).where('id', '=', p.id).execute();
        stats.rescheduled++;
      }
    }

    // 2) Programar el siguiente paso de los presupuestos elegibles sin paso en curso.
    const candidates = await trx
      .selectFrom('quotes as q')
      .innerJoin('contacts as c', (j) => j.onRef('c.id', '=', 'q.contactId').onRef('c.companyId', '=', 'q.companyId'))
      .selectAll('q')
      .select(['c.email as contactEmail', 'c.fullName as contactName'])
      .where('q.companyId', '=', companyId)
      .where('q.status', '=', 'sent')
      .where('q.archivedAt', 'is', null)
      .where('q.autoFollowUpEnabled', '=', true)
      .where('q.sentAt', 'is not', null)
      .where('c.email', 'is not', null)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('followUps as f')
              .select('f.id')
              .whereRef('f.quoteId', '=', 'q.id')
              .whereRef('f.companyId', '=', 'q.companyId')
              .where('f.source', '=', 'rule')
              .where('f.status', 'in', ['pending', 'sending']),
          ),
        ),
      )
      .execute();

    const last = ctx.schedule[ctx.schedule.length - 1]!;
    for (const q of candidates) {
      const sentAt = q.sentAt!;
      const sentKey = sentAt.toISOString();
      const days = localDaysBetween(sentAt, now, ctx.rules.timezone);
      if (days > last + STALE_AFTER_LAST_STEP_DAYS) continue; // fuera de secuencia

      const done = await trx
        .selectFrom('followUps')
        .select((eb) => eb.fn.max('sequenceStep').as('maxStep'))
        .where('companyId', '=', companyId)
        .where('quoteId', '=', q.id)
        .where('source', '=', 'rule')
        .where('sequenceKey', '=', sentKey)
        .executeTakeFirst();
      let next = (done?.maxStep ?? 0) + 1;
      // Si el motor se activa tarde, no se envían de golpe los pasos ya pasados: se salta al vigente.
      while (next < ctx.schedule.length && days >= ctx.schedule[next]!) next++;
      if (next > ctx.schedule.length) continue;

      if (await hasEmailExclusion(trx, companyId, { id: q.contactId, email: q.contactEmail })) continue;

      let due = stepDueAt(sentAt, ctx.schedule[next - 1]!, ctx.rules);
      if (due && due < now) due = nextAllowedSlot(now, ctx.rules);
      if (!due) continue;

      const inserted = await trx
        .insertInto('followUps')
        .values({
          companyId,
          quoteId: q.id,
          channel: 'email',
          status: 'pending',
          source: 'rule',
          title: `Email automático ${next} de ${ctx.schedule.length}`,
          notes: null,
          dueAt: due,
          assignedUserId: q.ownerUserId,
          completedAt: null,
          completedByUserId: null,
          outcome: null,
          cancelledAt: null,
          cancelReason: null,
          dedupeKey: `auto:${q.id}:${sentKey}:${next}`,
          sequenceStep: next,
          sequenceKey: sentKey,
          approvedAt: null,
          approvedByUserId: null,
          approvedTemplateVersionId: null,
          approvedSubject: null,
          approvedBody: null,
          sentAt: null,
          failureReason: null,
          createdByUserId: null,
        })
        // Idempotente: si otro proceso ya lo creó (misma clave), no se duplica.
        .onConflict((oc) => oc.doNothing())
        .returning('id')
        .executeTakeFirst();
      if (inserted) {
        stats.scheduled++;
        await logActivity(trx, SYSTEM(companyId), {
          action: 'follow_up.scheduled',
          entityType: 'follow_up',
          entityId: inserted.id,
          quoteId: q.id,
          metadata: { channel: 'email', step: next, dueAt: due, requiresApproval: ctx.requireApproval },
        });
      }
    }
  });
  return stats;
}

async function cancelFollowUp(trx: Trx, companyId: string, id: string, quoteId: string, reason: string) {
  const res = await trx
    .updateTable('followUps')
    .set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: reason })
    .where('companyId', '=', companyId)
    .where('id', '=', id)
    .where('status', '=', 'pending')
    .returning('id')
    .executeTakeFirst();
  if (res) {
    await logActivity(trx, SYSTEM(companyId), {
      action: 'follow_up.cancelled',
      entityType: 'follow_up',
      entityId: id,
      quoteId,
      metadata: { reason, automatic: true },
    });
  }
}

/** Cancela todos los pasos automáticos pendientes de una empresa (p. ej. al desactivar el envío). */
export async function cancelPendingRuleSteps(trx: Trx, companyId: string, reason: string, quoteId?: string): Promise<number> {
  let q = trx
    .updateTable('followUps')
    .set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: reason })
    .where('companyId', '=', companyId)
    .where('source', '=', 'rule')
    .where('status', '=', 'pending');
  if (quoteId) q = q.where('quoteId', '=', quoteId);
  return (await q.returning('id').execute()).length;
}

// ---------------------------------------------------------------------------
// Envío: reclamar → comprobar → enviar (fuera de la transacción) → registrar
// ---------------------------------------------------------------------------

export interface DispatchStats {
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  cancelled: number;
  waiting: number;
}

interface Claimed {
  followUpId: string;
  quoteId: string;
  deliveryId: string;
  attempt: number;
  step: number;
  email: Parameters<FollowUpEmailProvider['send']>[0];
}

export async function dispatchCompany(deps: EngineDeps, companyId: string): Promise<DispatchStats> {
  const now = deps.now?.() ?? new Date();
  const { automation } = deps.config;
  const stats: DispatchStats = { claimed: 0, sent: 0, failed: 0, retried: 0, cancelled: 0, waiting: 0 };
  if (!deps.provider.configured) return stats;

  const claimed: Claimed[] = await withTenant(deps.db, SYSTEM(companyId), async (trx) => {
    // Un solo proceso a la vez reclama envíos de esta empresa: así el límite diario es exacto.
    await sql`select pg_advisory_xact_lock(hashtextextended(${`dispatch:${companyId}`}, 0))`.execute(trx);
    const ctx = await loadCompanyContext(trx, companyId, now);
    const sentToday = await automaticEmailsToday(trx, companyId, ctx.rules.timezone, now);
    // Dos límites independientes: el técnico diario de emails y los intentos del periodo
    // (descontando los que otro ciclo tiene en curso). Si no hay plan activo no se descuenta
    // nada aquí: los pasos vencidos se cancelan abajo (no_active_plan).
    const planCtx = await loadPlanContext(trx, companyId, now);
    const capacity = await attemptCapacity(trx, planCtx, now);
    const available = Math.max(Math.min(ctx.dailyEmailLimit - sentToday, ctx.hasAccess ? capacity.available : 25), 0);
    if (available === 0) {
      // Límite diario o intentos en curso que agotan el cupo: lo vencido espera.
      stats.waiting += Number(
        (
          await trx
            .selectFrom('followUps')
            .select((eb) => eb.fn.countAll<string>().as('n'))
            .where('companyId', '=', companyId)
            .where('source', '=', 'rule')
            .where('status', '=', 'pending')
            .where('dueAt', '<=', now)
            .executeTakeFirstOrThrow()
        ).n,
      );
      return [];
    }
    // FOR UPDATE SKIP LOCKED: otro proceso que ejecute lo mismo a la vez se salta estas filas.
    const due = await trx
      .selectFrom('followUps')
      .selectAll()
      .where('companyId', '=', companyId)
      .where('source', '=', 'rule')
      .where('status', '=', 'pending')
      .where('dueAt', '<=', now)
      .orderBy('dueAt')
      .limit(Math.min(25, available))
      .forUpdate()
      .skipLocked()
      .execute();

    const out: Claimed[] = [];
    for (const f of due) {
      const quote = await trx.selectFrom('quotes').selectAll().where('companyId', '=', companyId).where('id', '=', f.quoteId).executeTakeFirstOrThrow();
      const contact = await trx.selectFrom('contacts').selectAll().where('companyId', '=', companyId).where('id', '=', quote.contactId).executeTakeFirstOrThrow();
      const verdict = await sendTimeEligibility(trx, ctx, deps, f, quote, contact, now);
      if (!verdict.ok) {
        if (verdict.action === 'cancel') {
          await cancelFollowUp(trx, companyId, f.id, f.quoteId, verdict.reason);
          stats.cancelled++;
        } else {
          stats.waiting++;
          if (verdict.until && (!f.dueAt || verdict.until > f.dueAt)) {
            await trx.updateTable('followUps').set({ dueAt: verdict.until }).where('companyId', '=', companyId).where('id', '=', f.id).execute();
          }
        }
        continue;
      }

      // Contenido: el aprobado (instantánea) o la versión vigente de la plantilla.
      const template = f.approvedTemplateVersionId
        ? await trx.selectFrom('messageTemplateVersions').selectAll().where('companyId', '=', companyId).where('id', '=', f.approvedTemplateVersionId).executeTakeFirstOrThrow()
        : await currentTemplate(trx, companyId, f.sequenceStep!);
      const rendered = f.approvedAt
        ? { subject: f.approvedSubject!, body: f.approvedBody! }
        : renderBody(template, templateValues(ctx, quote, contact));

      const unsubscribeToken = generateToken();
      const unsubscribeUrl = `${automation.publicApiUrl}/api/v1/public/unsubscribe?token=${unsubscribeToken}`;
      const webUnsubscribeUrl = `${deps.config.appWebUrl}/baja?token=${unsubscribeToken}`;
      const message = composeMessage(rendered.subject, rendered.body, ctx.sender, webUnsubscribeUrl);
      const attempt = f.attemptCount + 1;

      // Se reserva el intento del plan ANTES de enviar (dentro del bloqueo de la empresa).
      if (!capacity.period || !(await reserveAttempt(trx, companyId, capacity.period, { id: f.id, quoteId: f.quoteId }, now))) {
        stats.waiting++;
        continue;
      }

      const delivery = await trx
        .insertInto('messageDeliveries')
        .values({
          companyId,
          followUpId: f.id,
          quoteId: f.quoteId,
          contactId: contact.id,
          channel: 'email',
          provider: deps.provider.name,
          templateVersionId: template.id,
          templateStep: template.step,
          templateVersion: template.version,
          attemptNumber: attempt,
          status: 'sending',
          recipient: contact.email!,
          subject: message.subject,
          bodyText: message.text,
          contentPurgedAt: null,
          providerMessageId: null,
          errorCode: null,
          errorDetail: null,
          unsubscribeTokenHash: hashToken(unsubscribeToken),
          sentAt: null,
          deliveredAt: null,
          failedAt: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx.updateTable('followUps').set({ status: 'sending', attemptCount: attempt }).where('companyId', '=', companyId).where('id', '=', f.id).execute();

      const fromName = (ctx.senderName ?? ctx.sender.companyName).replace(/["\r\n<>]/g, '').slice(0, 80);
      out.push({
        followUpId: f.id,
        quoteId: f.quoteId,
        deliveryId: delivery.id,
        attempt,
        step: f.sequenceStep!,
        email: {
          deliveryId: delivery.id,
          from: `"${fromName}" <${automation.fromEmail}>`,
          to: contact.email!,
          replyTo: ctx.replyTo!,
          subject: message.subject,
          text: message.text,
          html: message.html,
          unsubscribeUrl,
        },
      });
    }
    return out;
  });

  stats.claimed = claimed.length;
  for (const c of claimed) {
    const result = await deps.provider.send(c.email).catch((error: unknown) => ({
      ok: false as const,
      retryable: true,
      code: 'provider_exception',
      detail: String((error as Error).message ?? error).slice(0, 200),
    }));
    await withTenant(deps.db, SYSTEM(companyId), async (trx) => {
      const at = deps.now?.() ?? new Date();
      if (result.ok) {
        await trx
          .updateTable('messageDeliveries')
          .set({ status: 'sent', sentAt: at, providerMessageId: result.providerMessageId })
          .where('companyId', '=', companyId)
          .where('id', '=', c.deliveryId)
          .execute();
        await trx.updateTable('followUps').set({ status: 'sent', sentAt: at, failureReason: null }).where('companyId', '=', companyId).where('id', '=', c.followUpId).execute();
        // El proveedor aceptó el email: el intento cuenta (una vez por seguimiento).
        const period = await confirmAttempt(trx, companyId, c.followUpId, c.deliveryId, at);
        if (period && period.attemptsCounted === period.attemptLimit) {
          await logActivity(trx, SYSTEM(companyId), {
            action: 'usage.limit_reached',
            entityType: 'company',
            entityId: companyId,
            metadata: { unit: 'attempts', plan: period.plan, limit: period.attemptLimit, periodEnd: period.periodEnd },
          });
        }
        await trx
          .updateTable('quotes')
          .set((eb) => ({ lastFollowUpAt: eb.fn('greatest', [eb.ref('lastFollowUpAt'), eb.val(at)]) }))
          .where('companyId', '=', companyId)
          .where('id', '=', c.quoteId)
          .execute();
        await logActivity(trx, SYSTEM(companyId), {
          action: 'follow_up.sent',
          entityType: 'follow_up',
          entityId: c.followUpId,
          quoteId: c.quoteId,
          metadata: { channel: 'email', step: c.step, provider: deps.provider.name, attempt: c.attempt },
        });
        stats.sent++;
        return;
      }

      await trx
        .updateTable('messageDeliveries')
        .set({ status: 'failed', failedAt: at, errorCode: result.code.slice(0, 60), errorDetail: result.detail || null })
        .where('companyId', '=', companyId)
        .where('id', '=', c.deliveryId)
        .execute();
      // El envío no se realizó: el intento no cuenta (un reintento lo vuelve a reservar).
      await releaseAttempt(trx, companyId, c.followUpId, 'released', result.code, c.deliveryId, at);
      if (result.retryable && c.attempt < automation.maxAttempts) {
        const wait = automation.retryBackoffMs[Math.min(c.attempt - 1, automation.retryBackoffMs.length - 1)]!;
        await trx
          .updateTable('followUps')
          .set({ status: 'pending', dueAt: new Date(at.getTime() + wait), failureReason: result.code.slice(0, 200) })
          .where('companyId', '=', companyId)
          .where('id', '=', c.followUpId)
          .execute();
        stats.retried++;
      } else {
        await trx
          .updateTable('followUps')
          .set({ status: 'failed', failureReason: result.code.slice(0, 200) })
          .where('companyId', '=', companyId)
          .where('id', '=', c.followUpId)
          .execute();
        await logActivity(trx, SYSTEM(companyId), {
          action: 'follow_up.failed',
          entityType: 'follow_up',
          entityId: c.followUpId,
          quoteId: c.quoteId,
          metadata: { channel: 'email', step: c.step, reason: result.code, attempts: c.attempt },
        });
        stats.failed++;
      }
    });
  }
  return stats;
}

async function sendTimeEligibility(
  trx: Trx,
  ctx: CompanyContext,
  deps: EngineDeps,
  f: FollowUp,
  quote: Quote,
  contact: Contact,
  now: Date,
): Promise<Verdict> {
  const base = await baseEligibility(trx, ctx, deps.provider, quote, contact, f.sequenceStep!);
  if (!base.ok) return base;
  if (!ctx.replyTo) return { ok: false, action: 'wait', reason: 'reply_to_missing' };
  if (f.sequenceKey !== quote.sentAt!.toISOString()) return { ok: false, action: 'cancel', reason: 'quote_resent' };
  const overdue = f.dueAt ? now.getTime() - f.dueAt.getTime() : 0;
  if (ctx.requireApproval && !f.approvedAt) {
    if (overdue > deps.config.automation.expireAfterMs) return { ok: false, action: 'cancel', reason: 'approval_expired' };
    return { ok: false, action: 'wait', reason: 'awaiting_approval' };
  }
  // Tras una parada larga no se envían mensajes con días de retraso.
  if (overdue > deps.config.automation.expireAfterMs && f.attemptCount === 0) return { ok: false, action: 'cancel', reason: 'expired' };
  // Separación mínima con el último contacto (manual o automático).
  const gap = deps.config.automation.minGapBetweenContactsMs;
  if (quote.lastFollowUpAt && now.getTime() - quote.lastFollowUpAt.getTime() < gap) {
    const after = nextAllowedSlot(new Date(quote.lastFollowUpAt.getTime() + gap), ctx.rules);
    return { ok: false, action: 'wait', reason: 'recent_contact', ...(after ? { until: after } : {}) };
  }
  const slot = nextAllowedSlot(now, ctx.rules);
  if (!slot) return { ok: false, action: 'wait', reason: 'no_allowed_window' };
  if (slot.getTime() !== now.getTime()) return { ok: false, action: 'wait', reason: 'outside_window', until: slot };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Recuperación tras reinicios y conservación de datos
// ---------------------------------------------------------------------------

/**
 * Un intento que quedó "en curso" (el proceso se detuvo entre el envío y su registro) tiene
 * un resultado desconocido. Para no arriesgar un duplicado, NO se reenvía: queda como fallido
 * con motivo "unknown_outcome" para que alguien lo revise.
 */
export async function recoverStuckDeliveries(deps: EngineDeps): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const cutoff = new Date(now.getTime() - deps.config.automation.stuckAfterMs);
  const { rows } = await sql<{ id: string }>`select app_companies_with_stuck_deliveries(${cutoff}) as id`.execute(deps.db);
  let recovered = 0;
  for (const { id: companyId } of rows) {
    await withTenant(deps.db, SYSTEM(companyId), async (trx) => {
      const stuck = await trx
        .updateTable('messageDeliveries')
        .set({ status: 'unknown', errorCode: 'unknown_outcome', errorDetail: 'El proceso se detuvo durante el envío; no se reintenta para evitar duplicados' })
        .where('companyId', '=', companyId)
        .where('status', '=', 'sending')
        .where('createdAt', '<', cutoff)
        .returning(['id', 'followUpId', 'quoteId'])
        .execute();
      for (const s of stuck) {
        // Resultado desconocido: no se cobra (no se puede verificar) y tampoco se reintenta.
        await releaseAttempt(trx, companyId, s.followUpId, 'unverified', 'unknown_outcome', s.id, now);
        await trx
          .updateTable('followUps')
          .set({ status: 'failed', failureReason: 'unknown_outcome' })
          .where('companyId', '=', companyId)
          .where('id', '=', s.followUpId)
          .where('status', '=', 'sending')
          .execute();
        await logActivity(trx, SYSTEM(companyId), {
          action: 'follow_up.failed',
          entityType: 'follow_up',
          entityId: s.followUpId,
          quoteId: s.quoteId,
          metadata: { channel: 'email', reason: 'unknown_outcome' },
        });
        recovered++;
      }
    });
  }
  return recovered;
}

export async function applyRetention(deps: EngineDeps): Promise<{ purgedContent: number; webhookEvents: number; jobRuns: number }> {
  const now = deps.now?.() ?? new Date();
  const contentCutoff = new Date(now.getTime() - deps.config.automation.contentRetentionDays * 86_400_000);
  const { rows } = await sql<{ n: number }>`select app_purge_delivery_content(${contentCutoff}) as n`.execute(deps.db);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const events = await deps.db.deleteFrom('webhookEvents').where('receivedAt', '<', monthAgo).executeTakeFirst();
  const runs = await deps.db.deleteFrom('jobRuns').where('startedAt', '<', monthAgo).executeTakeFirst();
  return { purgedContent: rows[0]?.n ?? 0, webhookEvents: Number(events.numDeletedRows), jobRuns: Number(runs.numDeletedRows) };
}

export async function automationCompanyIds(db: Db): Promise<string[]> {
  const { rows } = await sql<{ id: string }>`select app_automation_company_ids() as id`.execute(db);
  return rows.map((r) => r.id);
}

/** Para pruebas y la API: ejecuta una función con el contexto de empresa ya fijado. */
export async function inCompany<T>(db: Db, companyId: string, fn: (trx: Trx) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await setTenant(trx, SYSTEM(companyId));
    return fn(trx);
  });
}
