import { sql } from 'kysely';
import type { Trx } from '../../db/database.js';
import type { Quote, QuoteStatus, QuoteUpdate } from '../../db/types.js';
import { allowedTransitions, transitionKind } from '../../domain/quote-status.js';
import { errors, pgConstraint, pgErrorCode, PG_UNIQUE_VIOLATION } from '../../lib/errors.js';
import type { AuthContext } from '../../plugins/auth.js';
import { can } from '../../domain/permissions.js';
import { RECOVERY_ATTRIBUTION_MS } from '../../domain/recovery.js';
import { recordRecovery } from '../usage/service.js';
import { logActivity } from '../activity/service.js';

/** Margen para relojes ligeramente desincronizados del cliente. */
const CLOCK_SKEW_MS = 2 * 60_000;

export function quoteQuery(trx: Trx, companyId: string) {
  return trx
    .selectFrom('quotes as q')
    .innerJoin('contacts as c', (join) => join.onRef('c.id', '=', 'q.contactId').onRef('c.companyId', '=', 'q.companyId'))
    .leftJoin('users as o', 'o.id', 'q.ownerUserId')
    .selectAll('q')
    .select([
      'c.fullName as contactFullName',
      'c.email as contactEmail',
      'c.phone as contactPhone',
      'c.organization as contactOrganization',
      'o.fullName as ownerFullName',
    ])
    .where('q.companyId', '=', companyId)
    // Un presupuesto suprimido (anonimizado) ya no se muestra ni se puede modificar.
    .where('q.deletedAt', 'is', null);
}

type QuoteRow = Quote & {
  contactFullName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactOrganization: string | null;
  ownerFullName: string | null;
};

export function quoteDto(q: QuoteRow) {
  return {
    id: q.id,
    reference: q.reference,
    title: q.title,
    description: q.description,
    amountCents: q.amountCents,
    currency: q.currency,
    status: q.status,
    statusChangedAt: q.statusChangedAt,
    sentAt: q.sentAt,
    validUntil: q.validUntil,
    lastFollowUpAt: q.lastFollowUpAt,
    respondedAt: q.respondedAt,
    reactivatedAt: q.reactivatedAt,
    acceptedAt: q.acceptedAt,
    acceptance:
      q.status === 'accepted'
        ? {
            confirmedByUserId: q.acceptanceConfirmedByUserId,
            evidence: q.acceptanceEvidence,
            amountCents: q.acceptedAmountCents,
            // El importe lo declara la empresa; Presupio no puede verificarlo automáticamente.
            amountSource: 'declared_by_company' as const,
          }
        : null,
    rejectedAt: q.rejectedAt,
    rejectionReason: q.rejectionReason,
    archivedAt: q.archivedAt,
    externalSource: q.externalSource,
    externalId: q.externalId,
    autoFollowUpEnabled: q.autoFollowUpEnabled,
    contact: {
      id: q.contactId,
      fullName: q.contactFullName,
      email: q.contactEmail,
      phone: q.contactPhone,
      organization: q.contactOrganization,
    },
    owner: q.ownerUserId ? { id: q.ownerUserId, fullName: q.ownerFullName } : null,
    // Etapas separadas: responder ≠ reactivar ≠ vender (plan maestro, sección 4).
    outcome: {
      responded: q.respondedAt !== null,
      reactivated: q.reactivatedAt !== null,
      recoveredSale: q.status === 'accepted' && q.reactivatedAt !== null,
    },
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

export async function getQuoteRow(trx: Trx, companyId: string, id: string): Promise<QuoteRow> {
  const row = await quoteQuery(trx, companyId).where('q.id', '=', id).executeTakeFirst();
  if (!row) throw errors.notFound('Presupuesto no encontrado.');
  return row;
}

/** Bloquea la fila del presupuesto para modificarla sin condiciones de carrera. */
export async function lockQuote(trx: Trx, companyId: string, id: string): Promise<Quote> {
  const quote = await trx.selectFrom('quotes').selectAll().where('companyId', '=', companyId).where('id', '=', id).where('deletedAt', 'is', null).forUpdate().executeTakeFirst();
  if (!quote) throw errors.notFound('Presupuesto no encontrado.');
  return quote;
}

export function translateQuoteConflict(error: unknown): never {
  if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
    const c = pgConstraint(error);
    if (c === 'quotes_company_reference_key') throw errors.conflict('Ya existe un presupuesto con esa referencia.');
    if (c === 'quotes_company_external_key') throw errors.conflict('Ese presupuesto externo ya está importado.');
  }
  throw error;
}

export async function assertMember(trx: Trx, companyId: string, userId: string, field: string): Promise<void> {
  const m = await trx.selectFrom('memberships').select('id').where('companyId', '=', companyId).where('userId', '=', userId).executeTakeFirst();
  if (!m) throw errors.validation('El usuario indicado no pertenece a la empresa.', [{ path: field, message: 'Usuario no válido' }]);
}

export function assertNotFuture(date: Date, field: string): void {
  if (date.getTime() > Date.now() + CLOCK_SKEW_MS) {
    throw errors.validation('La fecha no puede estar en el futuro.', [{ path: field, message: 'No puede ser una fecha futura' }]);
  }
}

/** Cancela los seguimientos pendientes de un presupuesto (p. ej. porque el cliente ha respondido). */
export async function cancelPendingFollowUps(
  trx: Trx,
  companyId: string,
  quoteId: string,
  reason: string,
  options: { onlyContact: boolean },
): Promise<number> {
  let q = trx
    .updateTable('followUps')
    .set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: reason })
    .where('companyId', '=', companyId)
    .where('quoteId', '=', quoteId)
    .where('status', '=', 'pending');
  if (options.onlyContact) q = q.where('channel', '<>', 'task');
  return (await q.returning('id').execute()).length;
}

/**
 * Último seguimiento realizado y verificable antes de la respuesta del cliente, dentro de la
 * ventana de atribución (domain/recovery.ts): un contacto manual registrado como hecho o un
 * email automático aceptado por el proveedor. Las tareas internas no cuentan.
 */
async function followUpBeforeResponse(trx: Trx, companyId: string, quoteId: string, at: Date) {
  const from = new Date(at.getTime() - RECOVERY_ATTRIBUTION_MS);
  const row = await trx
    .selectFrom('followUps')
    .select(['id', 'source', 'channel', sql<Date>`coalesce(completed_at, sent_at)`.as('doneAt')])
    .where('companyId', '=', companyId)
    .where('quoteId', '=', quoteId)
    .where('channel', '<>', 'task')
    .where((eb) =>
      eb.or([
        eb.and([eb('status', '=', 'completed'), eb('completedAt', '<=', at), eb('completedAt', '>=', from)]),
        eb.and([eb('status', '=', 'sent'), eb('sentAt', '<=', at), eb('sentAt', '>=', from)]),
      ]),
    )
    .orderBy(sql`coalesce(completed_at, sent_at)`, 'desc')
    .limit(1)
    .executeTakeFirst();
  return row ? { id: row.id, source: row.source, channel: row.channel, at: row.doneAt } : null;
}

export type RecoveryNotCountedReason = 'response_dated_before_follow_up' | 'follow_up_outside_window';

/**
 * Si una respuesta no cuenta como recuperación pero el presupuesto SÍ tiene un seguimiento
 * verificable registrado, explica por qué. Sirve para dejar constancia (historial y
 * supervisión): la fecha de respuesta la declara la empresa y Presupio no puede comprobarla.
 */
async function whyRecoveryNotCounted(trx: Trx, companyId: string, quoteId: string, declaredAt: Date): Promise<{
  reason: RecoveryNotCountedReason;
  followUp: { id: string; source: 'manual' | 'rule'; at: Date };
} | null> {
  const done = sql<Date>`coalesce(completed_at, sent_at)`;
  const verifiable = (qb: any) =>
    qb
      .where('companyId', '=', companyId)
      .where('quoteId', '=', quoteId)
      .where('channel', '<>', 'task')
      .where((eb: any) => eb.or([eb('status', '=', 'completed'), eb('status', '=', 'sent')]));
  // Seguimiento ya registrado con fecha POSTERIOR a la respuesta declarada.
  const after = await verifiable(trx.selectFrom('followUps').select(['id', 'source', done.as('doneAt')]))
    .where(done, '>', declaredAt)
    .orderBy(done, 'asc')
    .limit(1)
    .executeTakeFirst();
  if (after) return { reason: 'response_dated_before_follow_up', followUp: { id: after.id, source: after.source, at: after.doneAt } };
  // Seguimiento anterior, pero fuera de la ventana de atribución.
  const before = await verifiable(trx.selectFrom('followUps').select(['id', 'source', done.as('doneAt')]))
    .where(done, '<=', declaredAt)
    .orderBy(done, 'desc')
    .limit(1)
    .executeTakeFirst();
  if (before) return { reason: 'follow_up_outside_window', followUp: { id: before.id, source: before.source, at: before.doneAt } };
  return null;
}

export interface StatusChangeInput {
  status: QuoteStatus;
  occurredAt?: Date | undefined;
  note?: string | null | undefined;
  evidence?: string | undefined;
  acceptedAmountCents?: number | undefined;
  rejectionReason?: string | null | undefined;
}

export async function changeQuoteStatus(trx: Trx, auth: AuthContext, quoteId: string, input: StatusChangeInput) {
  const quote = await lockQuote(trx, auth.companyId, quoteId);
  if (quote.archivedAt) throw errors.invalidTransition('El presupuesto está archivado. Desarchívalo antes de cambiar su estado.');

  const from = quote.status;
  const to = input.status;
  const kind = transitionKind(from, to);
  const canCorrect = can(auth.role, 'quotes:reopen');
  if (!kind || (kind === 'correction' && !canCorrect)) {
    const allowed = allowedTransitions(from, canCorrect);
    throw errors.invalidTransition(
      allowed.length
        ? `No se puede pasar de "${from}" a "${to}". Estados permitidos: ${allowed.join(', ')}.`
        : `El estado "${from}" es definitivo y no admite cambios con tu rol.`,
    );
  }

  const now = new Date();
  const occurredAt = input.occurredAt ?? now;
  assertNotFuture(occurredAt, 'occurredAt');
  if (quote.sentAt && to !== 'sent' && occurredAt < quote.sentAt) {
    throw errors.validation('La fecha no puede ser anterior al envío del presupuesto.', [
      { path: 'occurredAt', message: 'Anterior a la fecha de envío' },
    ]);
  }

  const patch: QuoteUpdate = { status: to, statusChangedAt: now };
  let reactivated = false;
  let attributedFollowUp: Awaited<ReturnType<typeof followUpBeforeResponse>> = null;
  let notCounted: Awaited<ReturnType<typeof whyRecoveryNotCounted>> = null;

  // Al salir de un estado final por corrección, se limpian sus datos.
  if (from === 'accepted') Object.assign(patch, { acceptedAt: null, acceptanceEvidence: null, acceptedAmountCents: null, acceptanceConfirmedByUserId: null });
  if (from === 'rejected') Object.assign(patch, { rejectedAt: null, rejectionReason: null });

  switch (to) {
    case 'sent':
      if (from === 'draft') patch.sentAt = occurredAt;
      break;
    case 'responded':
    case 'accepted':
      patch.respondedAt = quote.respondedAt ?? occurredAt;
      if (!quote.reactivatedAt) {
        attributedFollowUp = await followUpBeforeResponse(trx, auth.companyId, quoteId, occurredAt);
        if (attributedFollowUp) {
          patch.reactivatedAt = occurredAt;
          reactivated = true;
        } else {
          notCounted = await whyRecoveryNotCounted(trx, auth.companyId, quoteId, occurredAt);
        }
      }
      if (to === 'accepted') {
        if (!input.evidence || input.evidence.trim().length < 3) {
          throw errors.validation('Para confirmar una venta, documenta la evidencia (contrato, pedido, señal…).', [
            { path: 'evidence', message: 'Obligatorio al aceptar' },
          ]);
        }
        Object.assign(patch, {
          acceptedAt: occurredAt,
          acceptanceEvidence: input.evidence.trim(),
          acceptedAmountCents: input.acceptedAmountCents ?? quote.amountCents,
          acceptanceConfirmedByUserId: auth.userId,
        });
      }
      break;
    case 'rejected':
      patch.respondedAt = quote.respondedAt ?? occurredAt;
      patch.rejectedAt = occurredAt;
      patch.rejectionReason = input.rejectionReason ?? null;
      break;
    case 'draft':
      break;
  }

  await trx.updateTable('quotes').set(patch).where('companyId', '=', auth.companyId).where('id', '=', quoteId).execute();

  // Recuperación: se registra como métrica en la misma transacción que la respuesta.
  let recovery: Awaited<ReturnType<typeof recordRecovery>> = null;
  if (reactivated && attributedFollowUp) {
    recovery = await recordRecovery(trx, auth, {
      quoteId,
      respondedAt: occurredAt,
      responseStatus: to === 'accepted' ? 'accepted' : 'responded',
      followUp: attributedFollowUp,
    });
  }

  // Respuesta con seguimiento registrado que no cuenta: queda constancia de por qué (con la
  // fecha declarada y la del seguimiento) en el historial del presupuesto.
  if (notCounted) {
    await logActivity(trx, auth, {
      action: 'recovery.not_counted',
      entityType: 'quote',
      entityId: quoteId,
      quoteId,
      metadata: {
        reason: notCounted.reason,
        declaredResponseAt: occurredAt,
        followUpId: notCounted.followUp.id,
        followUpAt: notCounted.followUp.at,
        automatic: notCounted.followUp.source === 'rule',
        // Cuánto se ha retrasado la fecha declarada respecto al momento de registrarla.
        backdatedHours: Math.round((now.getTime() - occurredAt.getTime()) / 3_600_000),
      },
    });
  }

  // El cliente ha contestado: se detiene la secuencia de seguimiento.
  let cancelledFollowUps = 0;
  if (to === 'responded') {
    cancelledFollowUps = await cancelPendingFollowUps(trx, auth.companyId, quoteId, 'quote_responded', { onlyContact: true });
  } else if (to === 'accepted' || to === 'rejected') {
    cancelledFollowUps = await cancelPendingFollowUps(trx, auth.companyId, quoteId, `quote_${to}`, { onlyContact: false });
  }

  await logActivity(trx, auth, {
    action: 'quote.status_changed',
    entityType: 'quote',
    entityId: quoteId,
    quoteId,
    metadata: {
      from,
      to,
      correction: kind === 'correction',
      occurredAt,
      reactivated,
      cancelledFollowUps,
      note: input.note ?? undefined,
    },
  });

  return {
    reactivated,
    cancelledFollowUps,
    // La recuperación es una métrica: no consume el plan (el consumo se mide en intentos).
    recovery: recovery && { status: recovery.status },
    recoveryNotCounted: notCounted?.reason ?? null,
  };
}

export async function quoteSummary(trx: Trx, companyId: string) {
  const byStatus = await trx
    .selectFrom('quotes')
    .select(['status', (eb) => eb.fn.countAll<string>().as('count')])
    .where('companyId', '=', companyId)
    .where('archivedAt', 'is', null)
    .groupBy('status')
    .execute();
  const outcomes = await trx
    .selectFrom('quotes')
    .select([
      sql<string>`count(*) filter (where responded_at is not null)`.as('responded'),
      sql<string>`count(*) filter (where reactivated_at is not null)`.as('reactivated'),
      sql<string>`count(*) filter (where status = 'accepted' and reactivated_at is not null)`.as('recoveredSales'),
      sql<string | null>`sum(accepted_amount_cents) filter (where status = 'accepted' and reactivated_at is not null)`.as('recoveredAmountCents'),
    ])
    .where('companyId', '=', companyId)
    .where('archivedAt', 'is', null)
    .executeTakeFirstOrThrow();
  const followUps = await trx
    .selectFrom('followUps')
    .select([
      sql<string>`count(*) filter (where status = 'pending')`.as('pending'),
      sql<string>`count(*) filter (where status = 'pending' and due_at < now())`.as('overdue'),
      // Contactos con clientes registrados como realizados (las tareas internas no cuentan).
      sql<string>`count(*) filter (where status in ('completed', 'sent') and channel <> 'task')`.as('completed'),
      sql<string>`count(*) filter (where status = 'failed')`.as('failed'),
      sql<string>`count(*) filter (where status = 'pending' and source = 'rule' and approved_at is null)`.as('awaitingApproval'),
    ])
    .where('companyId', '=', companyId)
    .executeTakeFirstOrThrow();

  const counts = { draft: 0, sent: 0, responded: 0, accepted: 0, rejected: 0 } satisfies Record<QuoteStatus, number>;
  for (const row of byStatus) counts[row.status] = Number(row.count);
  return {
    byStatus: counts,
    responded: Number(outcomes.responded),
    reactivated: Number(outcomes.reactivated),
    recoveredSales: Number(outcomes.recoveredSales),
    recoveredAmountCents: Number(outcomes.recoveredAmountCents ?? 0),
    recoveredAmountSource: 'declared_by_company' as const,
    followUps: {
      pending: Number(followUps.pending),
      overdue: Number(followUps.overdue),
      completed: Number(followUps.completed),
      failed: Number(followUps.failed),
      awaitingApproval: Number(followUps.awaitingApproval),
    },
  };
}
