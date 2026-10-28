import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errors } from '../../lib/errors.js';
import { decodeCursor, pageOf } from '../../lib/pagination.js';
import { email, idParams, optionalText, pagination, parseWith, phone, requiredText, uuid } from '../../lib/validation.js';
import { inTenant } from '../../plugins/auth.js';
import { logActivity } from '../activity/service.js';
import { contactChannel, getContact } from '../contacts/service.js';

const createBody = z
  .strictObject({
    contactId: uuid.optional(),
    email: email.optional(),
    phone: phone.optional(),
    channel: contactChannel.nullable().default(null),
    reason: z.enum(['opt_out_request', 'rejected', 'legal', 'bounced', 'manual']),
    notes: optionalText(2000).optional(),
  })
  .refine((b) => b.contactId || b.email || b.phone, {
    path: ['contactId'],
    message: 'Indica un contacto, un email o un teléfono',
  });

const liftBody = z.strictObject({ reason: requiredText(500, 3) });

const listQuery = z.strictObject({
  status: z.enum(['active', 'lifted', 'all']).default('active'),
  ...pagination,
});

const FIELDS = [
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

export async function exclusionRoutes(app: FastifyInstance) {
  app.get('/', { config: { permission: 'contacts:read' } }, async (req) => {
    const q = parseWith(listQuery, req.query);
    const cursor = decodeCursor(q.cursor);
    return inTenant(app, req, async (trx, auth) => {
      let query = trx
        .selectFrom('contactExclusions')
        .select(FIELDS)
        .where('companyId', '=', auth.companyId)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .limit(q.limit + 1);
      if (q.status === 'active') query = query.where('liftedAt', 'is', null);
      if (q.status === 'lifted') query = query.where('liftedAt', 'is not', null);
      if (cursor) {
        query = query.where((eb) =>
          eb.or([eb('createdAt', '<', cursor.createdAt), eb.and([eb('createdAt', '=', cursor.createdAt), eb('id', '<', cursor.id)])]),
        );
      }
      return pageOf(await query.execute(), q.limit);
    });
  });

  /**
   * Registra una exclusión y detiene en el acto los seguimientos de contacto pendientes
   * que la incumplirían.
   */
  app.post('/', { config: { permission: 'exclusions:create' } }, async (req, reply) => {
    const body = parseWith(createBody, req.body);
    const result = await inTenant(app, req, async (trx, auth) => {
      let targetEmail = body.email ?? null;
      let targetPhone = body.phone ?? null;
      if (body.contactId) {
        const contact = await getContact(trx, auth.companyId, body.contactId);
        targetEmail ??= contact.email;
        targetPhone ??= contact.phone;
      }
      const exclusion = await trx
        .insertInto('contactExclusions')
        .values({
          companyId: auth.companyId,
          contactId: body.contactId ?? null,
          email: targetEmail,
          phone: targetPhone,
          channel: body.channel,
          reason: body.reason,
          notes: body.notes ?? null,
          createdByUserId: auth.userId,
          liftedAt: null,
          liftedByUserId: null,
          liftReason: null,
        })
        .returning(FIELDS)
        .executeTakeFirstOrThrow();

      // Contactos afectados (por id, email o teléfono).
      const affectedContacts = trx
        .selectFrom('contacts')
        .select('id')
        .where('companyId', '=', auth.companyId)
        .where((eb) => {
          const t = [];
          if (body.contactId) t.push(eb('id', '=', body.contactId));
          if (targetEmail) t.push(eb('email', '=', targetEmail));
          if (targetPhone) t.push(eb('phone', '=', targetPhone));
          return eb.or(t);
        });
      const blockedChannels = body.channel ? [body.channel] : (['email', 'phone', 'whatsapp', 'sms', 'in_person'] as const);

      const cancelled = await trx
        .updateTable('followUps')
        .set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: 'contact_excluded' })
        .where('companyId', '=', auth.companyId)
        .where('status', '=', 'pending')
        .where('channel', 'in', [...blockedChannels])
        .where('quoteId', 'in', trx.selectFrom('quotes').select('id').where('companyId', '=', auth.companyId).where('contactId', 'in', affectedContacts))
        .returning('id')
        .execute();

      await logActivity(trx, auth, {
        action: 'exclusion.created',
        entityType: 'exclusion',
        entityId: exclusion.id,
        metadata: { reason: body.reason, channel: body.channel, cancelledFollowUps: cancelled.length },
      });
      return { exclusion, cancelledFollowUps: cancelled.length };
    });
    return reply.status(201).send(result);
  });

  app.post('/:id/lift', { config: { permission: 'exclusions:lift' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    const body = parseWith(liftBody, req.body);
    return inTenant(app, req, async (trx, auth) => {
      const exclusion = await trx
        .updateTable('contactExclusions')
        .set({ liftedAt: new Date(), liftedByUserId: auth.userId, liftReason: body.reason })
        .where('companyId', '=', auth.companyId)
        .where('id', '=', id)
        .where('liftedAt', 'is', null)
        .returning(FIELDS)
        .executeTakeFirst();
      if (!exclusion) throw errors.notFound('Exclusión activa no encontrada.');
      await logActivity(trx, auth, { action: 'exclusion.lifted', entityType: 'exclusion', entityId: id });
      return { exclusion };
    });
  });
}
