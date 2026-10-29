import type { FastifyInstance } from 'fastify';
import { inTenant } from '../../plugins/auth.js';
import { usageSummary } from './service.js';

export async function usageRoutes(app: FastifyInstance) {
  /** Consumo del plan en el periodo vigente. Solo lectura: el plan no se cambia desde la API. */
  app.get('/', { config: { permission: 'subscription:read' } }, async (req) =>
    inTenant(app, req, async (trx, auth) => ({ usage: await usageSummary(trx, auth.companyId) })),
  );
}
