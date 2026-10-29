import { z } from 'zod';
import type { Trx } from '../../db/database.js';
import type { FollowUpChannel, FollowUpOutcome } from '../../db/types.js';
import { CONTACT_FOLLOW_UP_STATUSES, FOLLOW_UP_ALLOWED_STATUSES } from '../../domain/quote-status.js';
import { errors } from '../../lib/errors.js';
import { isoDateTime, optionalText, requiredText, uuid } from '../../lib/validation.js';
import type { AuthContext } from '../../plugins/auth.js';
import { logActivity } from '../activity/service.js';
import { findBlockingExclusion, getContact } from '../contacts/service.js';
import { assertMember, assertNotFuture, lockQuote } from '../quotes/service.js';

export const followUpChannel = z.enum(['task', 'email', 'phone', 'whatsapp', 'sms', 'in_person']);
export const followUpOutcome = z.enum(['no_answer', 'left_message', 'contacted', 'responded', 'wrong_contact', 'other']);

export const createFollowUpBody = z
  .strictObject({
    channel: followUpChannel,
    title: requiredText(200).optional(),
    notes: optionalText(5000).optional(),
    dueAt: isoDateTime.optional(),
    assignedUserId: uuid.nullable().optional(),
    // Permite registrar directamente un seguimiento ya realizado.
    status: z.enum(['pending', 'completed']).default('pending'),
    outcome: followUpOutcome.optional(),
    completedAt: isoDateTime.optional(),
  })
  .refine((b) => b.status === 'completed' || (b.outcome === undefined && b.completedAt === undefined), {
    path: ['outcome'],
    message: 'Solo se indica resultado al registrar un seguimiento realizado',
  });

export const completeFollowUpBody = z.strictObject({
  outcome: followUpOutcome.optional(),
  notes: optionalText(5000).optional(),
  completedAt: isoDateTime.optional(),
});

const DEFAULT_TITLES: Record<FollowUpChannel, string> = {
  task: 'Tarea',
  email: 'Email de seguimiento',
  phone: 'Llamada de seguimiento',
  whatsapp: 'WhatsApp de seguimiento',
  sms: 'SMS de seguimiento',
  in_person: 'Visita de seguimiento',
};

export const FOLLOW_UP_FIELDS = [
  'f.id',
  'f.quoteId',
  'f.channel',
  'f.status',
  'f.source',
  'f.title',
  'f.notes',
  'f.dueAt',
  'f.assignedUserId',
  'f.completedAt',
  'f.completedByUserId',
  'f.outcome',
  'f.cancelledAt',
  'f.cancelReason',
  'f.createdByUserId',
  'f.createdAt',
  'f.updatedAt',
  'f.sequenceStep',
  'f.approvedAt',
  'f.approvedByUserId',
  'f.attemptCount',
  'f.sentAt',
  'f.failureReason',
] as const;

export function followUpQuery(trx: Trx, companyId: string) {
  return trx
    .selectFrom('followUps as f')
    .innerJoin('quotes as q', (j) => j.onRef('q.id', '=', 'f.quoteId').onRef('q.companyId', '=', 'f.companyId'))
    .innerJoin('contacts as c', (j) => j.onRef('c.id', '=', 'q.contactId').onRef('c.companyId', '=', 'q.companyId'))
    .leftJoin('users as a', 'a.id', 'f.assignedUserId')
    .select(FOLLOW_UP_FIELDS)
    .select(['q.title as quoteTitle', 'q.status as quoteStatus', 'c.fullName as contactFullName', 'a.fullName as assignedFullName'])
    .where('f.companyId', '=', companyId)
    .where('q.deletedAt', 'is', null);
}

type FollowUpRow = Awaited<ReturnType<ReturnType<typeof followUpQuery>['executeTakeFirstOrThrow']>>;

export function followUpDto(r: FollowUpRow) {
  const { quoteTitle, quoteStatus, contactFullName, assignedFullName, ...f } = r;
  return {
    ...f,
    quote: { id: f.quoteId, title: quoteTitle, status: quoteStatus },
    contact: { fullName: contactFullName },
    assignedUser: f.assignedUserId ? { id: f.assignedUserId, fullName: assignedFullName } : null,
  };
}

export async function getFollowUp(trx: Trx, companyId: string, id: string) {
  const row = await followUpQuery(trx, companyId).where('f.id', '=', id).executeTakeFirst();
  if (!row) throw errors.notFound('Seguimiento no encontrado.');
  return followUpDto(row);
}

/**
 * Comprueba que se puede registrar un contacto con el cliente por ese canal:
 * presupuesto no archivado, en un estado compatible y contacto no excluido.
 */
async function assertCanContact(
  trx: Trx,
  companyId: string,
  quote: { id: string; status: string; archivedAt: Date | null; contactId: string },
  channel: FollowUpChannel,
) {
  if (quote.archivedAt) throw errors.invalidTransition('El presupuesto está archivado.');
  if (!FOLLOW_UP_ALLOWED_STATUSES.includes(quote.status as never)) {
    throw errors.invalidTransition('El presupuesto ya está cerrado (aceptado o rechazado): no admite nuevos seguimientos.');
  }
  if (channel === 'task') return;
  if (!CONTACT_FOLLOW_UP_STATUSES.includes(quote.status as never)) {
    throw errors.invalidTransition('Marca el presupuesto como enviado antes de registrar contactos con el cliente.');
  }
  const contact = await getContact(trx, companyId, quote.contactId);
  const exclusion = await findBlockingExclusion(trx, companyId, contact, channel);
  if (exclusion) throw errors.contactExcluded();
}

function assertCompletionDate(completedAt: Date, sentAt: Date | null, channel: FollowUpChannel) {
  assertNotFuture(completedAt, 'completedAt');
  if (channel !== 'task' && sentAt && completedAt < sentAt) {
    throw errors.validation('Un seguimiento no puede ser anterior al envío del presupuesto.', [
      { path: 'completedAt', message: 'Anterior a la fecha de envío' },
    ]);
  }
}

async function touchLastFollowUp(trx: Trx, companyId: string, quoteId: string, at: Date) {
  await trx
    .updateTable('quotes')
    .set((eb) => ({ lastFollowUpAt: eb.fn('greatest', [eb.ref('lastFollowUpAt'), eb.val(at)]) }))
    .where('companyId', '=', companyId)
    .where('id', '=', quoteId)
    .execute();
}

export async function createFollowUp(trx: Trx, auth: AuthContext, quoteId: string, input: z.output<typeof createFollowUpBody>) {
  const quote = await lockQuote(trx, auth.companyId, quoteId);
  await assertCanContact(trx, auth.companyId, quote, input.channel);
  const assignedUserId = input.assignedUserId === undefined ? auth.userId : input.assignedUserId;
  if (assignedUserId) await assertMember(trx, auth.companyId, assignedUserId, 'assignedUserId');

  const completed = input.status === 'completed';
  const completedAt = completed ? (input.completedAt ?? new Date()) : null;
  if (completedAt) assertCompletionDate(completedAt, quote.sentAt, input.channel);

  const followUp = await trx
    .insertInto('followUps')
    .values({
      companyId: auth.companyId,
      quoteId,
      channel: input.channel,
      status: input.status,
      source: 'manual',
      title: input.title ?? DEFAULT_TITLES[input.channel],
      notes: input.notes ?? null,
      dueAt: input.dueAt ?? null,
      assignedUserId,
      completedAt,
      completedByUserId: completed ? auth.userId : null,
      outcome: completed ? (input.outcome ?? null) : null,
      cancelledAt: null,
      cancelReason: null,
      dedupeKey: null,
      createdByUserId: auth.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  if (completedAt && input.channel !== 'task') await touchLastFollowUp(trx, auth.companyId, quoteId, completedAt);
  await logActivity(trx, auth, {
    action: completed ? 'follow_up.logged' : 'follow_up.created',
    entityType: 'follow_up',
    entityId: followUp.id,
    quoteId,
    metadata: { channel: input.channel, outcome: completed ? (input.outcome ?? null) : undefined },
  });
  return getFollowUp(trx, auth.companyId, followUp.id);
}

async function lockPendingFollowUp(trx: Trx, companyId: string, id: string, options: { allowRule?: boolean } = {}) {
  const f = await trx.selectFrom('followUps').selectAll().where('companyId', '=', companyId).where('id', '=', id).forUpdate().executeTakeFirst();
  if (!f) throw errors.notFound('Seguimiento no encontrado.');
  if (f.status !== 'pending') throw errors.invalidTransition('El seguimiento ya no está pendiente.');
  // Un email automático lo envía Presupio: no se marca como hecho a mano ni se edita; se aprueba o se cancela.
  if (f.source === 'rule' && !options.allowRule) {
    throw errors.invalidTransition('Este es un email automático: apruébalo o cancélalo desde su ficha.');
  }
  return f;
}

export async function completeFollowUp(
  trx: Trx,
  auth: AuthContext,
  id: string,
  input: { outcome?: FollowUpOutcome | undefined; notes?: string | null | undefined; completedAt?: Date | undefined },
) {
  // Orden de bloqueo: presupuesto → seguimiento (igual que en createFollowUp).
  const peek = await trx.selectFrom('followUps').select('quoteId').where('companyId', '=', auth.companyId).where('id', '=', id).executeTakeFirst();
  if (!peek) throw errors.notFound('Seguimiento no encontrado.');
  const quote = await lockQuote(trx, auth.companyId, peek.quoteId);
  const f = await lockPendingFollowUp(trx, auth.companyId, id);
  await assertCanContact(trx, auth.companyId, quote, f.channel);
  const completedAt = input.completedAt ?? new Date();
  assertCompletionDate(completedAt, quote.sentAt, f.channel);

  await trx
    .updateTable('followUps')
    .set({
      status: 'completed',
      completedAt,
      completedByUserId: auth.userId,
      outcome: f.channel === 'task' ? null : (input.outcome ?? null),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    })
    .where('companyId', '=', auth.companyId)
    .where('id', '=', id)
    .execute();
  if (f.channel !== 'task') await touchLastFollowUp(trx, auth.companyId, quote.id, completedAt);
  await logActivity(trx, auth, {
    action: 'follow_up.completed',
    entityType: 'follow_up',
    entityId: id,
    quoteId: quote.id,
    metadata: { channel: f.channel, outcome: input.outcome ?? null },
  });
  return getFollowUp(trx, auth.companyId, id);
}

export async function cancelFollowUp(trx: Trx, auth: AuthContext, id: string, reason: string | null) {
  const f = await lockPendingFollowUp(trx, auth.companyId, id, { allowRule: true });
  await trx
    .updateTable('followUps')
    .set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: reason ?? 'manual' })
    .where('companyId', '=', auth.companyId)
    .where('id', '=', id)
    .execute();
  await logActivity(trx, auth, { action: 'follow_up.cancelled', entityType: 'follow_up', entityId: id, quoteId: f.quoteId });
  return getFollowUp(trx, auth.companyId, id);
}

export async function updateFollowUp(
  trx: Trx,
  auth: AuthContext,
  id: string,
  patch: { title?: string; notes?: string | null; dueAt?: Date | null; assignedUserId?: string | null },
) {
  await lockPendingFollowUp(trx, auth.companyId, id);
  if (patch.assignedUserId) await assertMember(trx, auth.companyId, patch.assignedUserId, 'assignedUserId');
  const f = await trx
    .updateTable('followUps')
    .set(patch)
    .where('companyId', '=', auth.companyId)
    .where('id', '=', id)
    .returning('quoteId')
    .executeTakeFirstOrThrow();
  await logActivity(trx, auth, {
    action: 'follow_up.updated',
    entityType: 'follow_up',
    entityId: id,
    quoteId: f.quoteId,
    metadata: { fields: Object.keys(patch) },
  });
  return getFollowUp(trx, auth.companyId, id);
}
