import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errors } from '../../lib/errors.js';
import { parseWith } from '../../lib/validation.js';
import { inTenant } from '../../plugins/auth.js';
import { companyMetrics, currentMonth, metricsHistory } from './service.js';

const query = z.strictObject({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato AAAA-MM')
    .optional(),
});

export async function metricsRoutes(app: FastifyInstance) {
  /** Métricas de un mes natural (por defecto, el actual) y evolución de los 6 últimos meses. */
  app.get('/', { config: { permission: 'quotes:read' } }, async (req) => {
    const q = parseWith(query, req.query);
    return inTenant(app, req, async (trx, auth) => {
      const now = new Date();
      const company = await trx.selectFrom('companies').select('timezone').where('id', '=', auth.companyId).executeTakeFirstOrThrow();
      const current = currentMonth(now, company.timezone);
      const [year, month] = q.month ? q.month.split('-').map(Number) : [current.year, current.month];
      if (year! * 12 + month! > current.year * 12 + current.month) {
        throw errors.validation('El mes no puede ser futuro.', [{ path: 'month', message: 'Mes futuro' }]);
      }
      if (year! < 2020) throw errors.validation('Mes no válido.', [{ path: 'month', message: 'Mes no válido' }]);
      return {
        metrics: await companyMetrics(trx, auth.companyId, year!, month!, now),
        history: await metricsHistory(trx, auth.companyId, year!, month!),
      };
    });
  });
}
