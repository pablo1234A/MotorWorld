import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errors } from '../../lib/errors.js';
import { decodeCursor, pageOf } from '../../lib/pagination.js';
import { email, idParams, optionalText, pagination, parseWith, phone, requiredText, uuid } from '../../lib/validation.js';
import { inTenant } from '../../plugins/auth.js';
import { logActivity } from '../activity/service.js';
import { contactChannel } from '../contacts/service.js';
import { registerExclusion } from './service.js';

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
  app.post('/', { config: { permission: 'exclusions:create', readOnlyAllowed: true } }, async (req, reply) => {
    const body = parseWith(createBody, req.body);
    const result = await inTenant(app, req, (trx, auth) => registerExclusion(trx, auth, { ...body, via: 'app' }));
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
