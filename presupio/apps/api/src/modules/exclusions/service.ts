import type { Trx } from '../../db/database.js';
import type { ContactChannel, ExclusionReason } from '../../db/types.js';
import { logActivity } from '../activity/service.js';
import { getContact } from '../contacts/service.js';

export const EXCLUSION_FIELDS = [
  'id',
  'contactId',
  'email',
  'phone',
  'channel',
  'reason',
  'notes',
  'createdAt',
  'createdByUserId',
  'liftedAt',
  'liftedByUserId',
  'liftReason',
] as const;

export interface ExclusionInput {
  contactId?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  channel: ContactChannel | null;
  reason: ExclusionReason;
  notes?: string | null | undefined;
  /** Origen para el historial: pantalla, enlace de baja, webhook del proveedor. */
  via?: 'app' | 'unsubscribe_link' | 'provider_webhook';
}

/**
 * Registra una exclusión y detiene en el acto los seguimientos pendientes (manuales o
 * automáticos) que la incumplirían. La usan la pantalla, el enlace de baja y los webhooks.
 */
export async function registerExclusion(trx: Trx, ctx: { companyId: string; userId: string | null }, input: ExclusionInput) {
  let targetEmail = input.email ?? null;
  let targetPhone = input.phone ?? null;
  if (input.contactId) {
    const contact = await getContact(trx, ctx.companyId, input.contactId);
    targetEmail ??= contact.email;
    targetPhone ??= contact.phone;
  }
  const exclusion = await trx
    .insertInto('contactExclusions')
    .values({
      companyId: ctx.companyId,
      contactId: input.contactId ?? null,
      email: targetEmail,
      phone: targetPhone,
      channel: input.channel,
      reason: input.reason,
      notes: input.notes ?? null,
      createdByUserId: ctx.userId,
      liftedAt: null,
      liftedByUserId: null,
      liftReason: null,
    })
    .returning(EXCLUSION_FIELDS)
    .executeTakeFirstOrThrow();

  // Contactos afectados (por id, email o teléfono).
  const affectedContacts = trx
    .selectFrom('contacts')
    .select('id')
    .where('companyId', '=', ctx.companyId)
    .where((eb) => {
      const t = [];
      if (input.contactId) t.push(eb('id', '=', input.contactId));
      if (targetEmail) t.push(eb('email', '=', targetEmail));
      if (targetPhone) t.push(eb('phone', '=', targetPhone));
      return eb.or(t);
    });
  const blockedChannels = input.channel ? [input.channel] : (['email', 'phone', 'whatsapp', 'sms', 'in_person'] as const);

  const cancelled = await trx
    .updateTable('followUps')
    .set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: 'contact_excluded' })
    .where('companyId', '=', ctx.companyId)
    .where('status', '=', 'pending')
    .where('channel', 'in', [...blockedChannels])
    .where('quoteId', 'in', trx.selectFrom('quotes').select('id').where('companyId', '=', ctx.companyId).where('contactId', 'in', affectedContacts))
    .returning('id')
    .execute();

  await logActivity(trx, ctx, {
    action: 'exclusion.created',
    entityType: 'exclusion',
    entityId: exclusion.id,
    metadata: { reason: input.reason, channel: input.channel, cancelledFollowUps: cancelled.length, via: input.via ?? 'app' },
  });
  return { exclusion, cancelledFollowUps: cancelled.length };
}

/** ¿Tiene el contacto una exclusión activa para email (o para todos los canales)? */
export async function hasEmailExclusion(trx: Trx, companyId: string, contact: { id: string; email: string | null }) {
  const row = await trx
    .selectFrom('contactExclusions')
    .select('id')
    .where('companyId', '=', companyId)
    .where('liftedAt', 'is', null)
    .where((eb) => eb.or([eb('channel', 'is', null), eb('channel', '=', 'email')]))
    .where((eb) => {
      const t = [eb('contactId', '=', contact.id)];
      if (contact.email) t.push(eb('email', '=', contact.email));
      return eb.or(t);
    })
    .limit(1)
    .executeTakeFirst();
  return !!row;
}
