import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { decodeCursor, pageOf } from '../../lib/pagination.js';
import { idParams, isoDateTime, optionalText, pagination, parseWith, requiredText, uuid } from '../../lib/validation.js';
import { inTenant } from '../../plugins/auth.js';
import {
  cancelFollowUp,
  completeFollowUp,
  completeFollowUpBody,
  followUpDto,
  followUpQuery,
  getFollowUp,
  updateFollowUp,
} from './service.js';

const listQuery = z.strictObject({
  status: z.enum(['pending', 'completed', 'cancelled', 'all']).default('pending'),
  assignedTo: z.union([z.literal('me'), uuid]).optional(),
  quoteId: uuid.optional(),
  dueBefore: isoDateTime.optional(),
  ...pagination,
});

const updateBody = z
  .strictObject({
    title: requiredText(200),
    notes: optionalText(5000),
    dueAt: isoDateTime.nullable(),
    assignedUserId: uuid.nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'No hay cambios');

const cancelBody = z.strictObject({ reason: optionalText(500).optional() });

export async function followUpRoutes(app: FastifyInstance) {
  app.get('/', { config: { permission: 'quotes:read' } }, async (req) => {
    const q = parseWith(listQuery, req.query);
    const cursor = decodeCursor(q.cursor);
    return inTenant(app, req, async (trx, auth) => {
      let query = followUpQuery(trx, auth.companyId).orderBy('f.createdAt', 'desc').orderBy('f.id', 'desc').limit(q.limit + 1);
      if (q.status !== 'all') query = query.where('f.status', '=', q.status);
      if (q.assignedTo) query = query.where('f.assignedUserId', '=', q.assignedTo === 'me' ? auth.userId : q.assignedTo);
      if (q.quoteId) query = query.where('f.quoteId', '=', q.quoteId);
      if (q.dueBefore) query = query.where('f.dueAt', '<', q.dueBefore);
      if (cursor) {
        query = query.where((eb) =>
          eb.or([eb('f.createdAt', '<', cursor.createdAt), eb.and([eb('f.createdAt', '=', cursor.createdAt), eb('f.id', '<', cursor.id)])]),
        );
      }
      const page = pageOf(await query.execute(), q.limit);
      return { items: page.items.map(followUpDto), nextCursor: page.nextCursor };
    });
  });

  app.get('/:id', { config: { permission: 'quotes:read' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    return inTenant(app, req, async (trx, auth) => ({ followUp: await getFollowUp(trx, auth.companyId, id) }));
  });

  app.patch('/:id', { config: { permission: 'follow_ups:write' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    const body = parseWith(updateBody, req.body);
    return inTenant(app, req, async (trx, auth) => ({ followUp: await updateFollowUp(trx, auth, id, body) }));
  });

  app.post('/:id/complete', { config: { permission: 'follow_ups:write' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    const body = parseWith(completeFollowUpBody, req.body);
    return inTenant(app, req, async (trx, auth) => ({ followUp: await completeFollowUp(trx, auth, id, body) }));
  });

  app.post('/:id/cancel', { config: { permission: 'follow_ups:write' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    const body = parseWith(cancelBody, req.body);
    return inTenant(app, req, async (trx, auth) => ({ followUp: await cancelFollowUp(trx, auth, id, body.reason ?? null) }));
  });
}
