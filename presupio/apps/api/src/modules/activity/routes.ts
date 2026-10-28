import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { inTenant } from '../../plugins/auth.js';
import { pagination, parseWith } from '../../lib/validation.js';
import { listActivity } from './service.js';

const listQuery = z.strictObject({
  entityType: z.enum(['company', 'settings', 'member', 'invitation', 'contact', 'quote', 'follow_up', 'exclusion']).optional(),
  ...pagination,
});

export async function activityRoutes(app: FastifyInstance) {
  app.get('/', { config: { permission: 'activity:read' } }, async (req) => {
    const q = parseWith(listQuery, req.query);
    return inTenant(app, req, (trx, auth) => listActivity(trx, auth.companyId, q));
  });
}
