import { z } from 'zod';
import type { Trx } from '../../db/database.js';
import type { Contact, ContactChannel, FollowUpChannel } from '../../db/types.js';
import { errors, pgConstraint, pgErrorCode, PG_UNIQUE_VIOLATION } from '../../lib/errors.js';
import { email, optionalText, phone, requiredText } from '../../lib/validation.js';
import { logActivity } from '../activity/service.js';

export const contactChannel = z.enum(['email', 'phone', 'whatsapp', 'sms']);

export const contactInput = z
  .strictObject({
    fullName: requiredText(160),
    email: email.nullable().optional(),
    phone: phone.nullable().optional(),
    organization: optionalText(160).optional(),
    preferredChannel: contactChannel.nullable().optional(),
    notes: optionalText(5000).optional(),
  })
  .refine((c) => !!c.email || !!c.phone, {
    path: ['email'],
    message: 'Indica al menos un email o un teléfono',
  });

export type ContactInput = z.output<typeof contactInput>;

export const CONTACT_FIELDS = [
  'id',
  'fullName',
  'email',
  'phone',
  'organization',
  'preferredChannel',
  'notes',
  'createdAt',
  'updatedAt',
] as const;

export async function getContact(trx: Trx, companyId: string, id: string): Promise<Contact> {
  const contact = await trx.selectFrom('contacts').selectAll().where('companyId', '=', companyId).where('id', '=', id).where('anonymizedAt', 'is', null).executeTakeFirst();
  if (!contact) throw errors.notFound('Contacto no encontrado.');
  return contact;
}

export function translateContactConflict(error: unknown): never {
  if (pgErrorCode(error) === PG_UNIQUE_VIOLATION && pgConstraint(error) === 'contacts_company_email_key') {
    throw errors.conflict('Ya existe un contacto con este email.');
  }
  throw error;
}

export async function createContact(
  trx: Trx,
  ctx: { companyId: string; userId: string },
  input: ContactInput,
): Promise<Contact> {
  const contact = await trx
    .insertInto('contacts')
    .values({
      companyId: ctx.companyId,
      fullName: input.fullName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      organization: input.organization ?? null,
      preferredChannel: input.preferredChannel ?? null,
      notes: input.notes ?? null,
      createdByUserId: ctx.userId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
    .catch(translateContactConflict);
  await logActivity(trx, ctx, { action: 'contact.created', entityType: 'contact', entityId: contact.id });
  return contact;
}

/** Reutiliza el contacto existente con el mismo email (evita duplicados) o lo crea. */
export async function findOrCreateContact(
  trx: Trx,
  ctx: { companyId: string; userId: string },
  input: ContactInput,
): Promise<Contact> {
  if (input.email) {
    const existing = await trx
      .selectFrom('contacts')
      .selectAll()
      .where('companyId', '=', ctx.companyId)
      .where('email', '=', input.email)
      .executeTakeFirst();
    if (existing) return existing;
  }
  return createContact(trx, ctx, input);
}

/** Canal de exclusión que afecta a un canal de seguimiento. 'task' (tarea interna) nunca se bloquea. */
function exclusionChannelFor(channel: FollowUpChannel): ContactChannel | 'any' | null {
  switch (channel) {
    case 'task':
      return null;
    case 'in_person':
      return 'any';
    default:
      return channel;
  }
}

/** Exclusión activa que impide contactar a este contacto por ese canal, si la hay. */
export async function findBlockingExclusion(
  trx: Trx,
  companyId: string,
  contact: Pick<Contact, 'id' | 'email' | 'phone'>,
  channel: FollowUpChannel,
) {
  const excluded = exclusionChannelFor(channel);
  if (excluded === null) return undefined;
  return trx
    .selectFrom('contactExclusions')
    .select(['id', 'reason', 'channel'])
    .where('companyId', '=', companyId)
    .where('liftedAt', 'is', null)
    .where((eb) => {
      const targets = [eb('contactId', '=', contact.id)];
      if (contact.email) targets.push(eb('email', '=', contact.email));
      if (contact.phone) targets.push(eb('phone', '=', contact.phone));
      return eb.or(targets);
    })
    .where((eb) => (excluded === 'any' ? eb('channel', 'is', null) : eb.or([eb('channel', 'is', null), eb('channel', '=', excluded)])))
    .executeTakeFirst();
}
