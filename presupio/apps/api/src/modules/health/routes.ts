import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';

export async function healthRoutes(app: FastifyInstance) {
  // Vivo: el proceso responde.
  app.get('/health', { config: { auth: 'none' } }, async () => ({ status: 'ok' }));

  // Listo: la base de datos responde. No expone versiones ni detalles internos.
  app.get('/health/ready', { config: { auth: 'none' } }, async (req, reply) => {
    try {
      await sql`select 1`.execute(app.db);
      return { status: 'ok', database: 'ok' };
    } catch (error) {
      req.log.error({ err: (error as Error).message }, 'Base de datos no disponible');
      return reply.status(503).send({ status: 'unavailable', database: 'error' });
    }
  });
}
