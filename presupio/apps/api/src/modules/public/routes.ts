import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { withTenant } from '../../db/database.js';
import { hashToken, TOKEN_PATTERN } from '../../lib/crypto.js';
import { errors } from '../../lib/errors.js';
import { parseWith } from '../../lib/validation.js';
import { hasEmailExclusion, registerExclusion } from '../exclusions/service.js';

const tokenSchema = z.string().regex(TOKEN_PATTERN, 'Enlace no válido');

/** Localiza el envío del enlace de baja (consulta acotada entre empresas: solo id y empresa). */
async function findDelivery(app: FastifyInstance, token: string) {
  const { rows } = await sql<{ deliveryId: string; companyId: string }>`
    select delivery_id as "deliveryId", company_id as "companyId" from app_find_delivery_by_unsubscribe_hash(${hashToken(token)})`.execute(app.db);
  const found = rows[0];
  if (!found) throw errors.invalidToken();
  return found;
}

/**
 * Baja de los correos de seguimiento, sin sesión. Admite la página de la aplicación (JSON)
 * y la baja de un clic de los clientes de correo (RFC 8058: POST con
 * "List-Unsubscribe=One-Click" y el token en la URL).
 */
export async function publicRoutes(app: FastifyInstance) {
  // Solo en este ámbito se aceptan formularios: lo exige la baja de un clic.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  const limit = { max: app.config.rateLimits.tokenRedeem.max, timeWindow: app.config.rateLimits.tokenRedeem.windowMs };

  app.post('/unsubscribe/preview', { config: { auth: 'none', rateLimit: limit } }, async (req) => {
    const { token } = parseWith(z.strictObject({ token: tokenSchema }), req.body);
    const found = await findDelivery(app, token);
    return withTenant(app.db, { companyId: found.companyId, userId: null }, async (trx) => {
      const d = await trx
        .selectFrom('messageDeliveries as d')
        .innerJoin('contacts as c', (j) => j.onRef('c.id', '=', 'd.contactId').onRef('c.companyId', '=', 'd.companyId'))
        .innerJoin('companies as co', 'co.id', 'd.companyId')
        .select(['co.name as companyName', 'c.id as contactId', 'c.email'])
        .where('d.id', '=', found.deliveryId)
        .executeTakeFirstOrThrow();
      return {
        companyName: d.companyName,
        alreadyUnsubscribed: await hasEmailExclusion(trx, found.companyId, { id: d.contactId, email: d.email }),
      };
    });
  });

  app.post('/unsubscribe', { config: { auth: 'none', rateLimit: limit } }, async (req) => {
    const query = req.query as Record<string, unknown>;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = parseWith(tokenSchema, typeof body.token === 'string' ? body.token : query.token);
    const found = await findDelivery(app, token);
    const companyName = await withTenant(app.db, { companyId: found.companyId, userId: null }, async (trx) => {
      const d = await trx
        .selectFrom('messageDeliveries as d')
        .innerJoin('contacts as c', (j) => j.onRef('c.id', '=', 'd.contactId').onRef('c.companyId', '=', 'd.companyId'))
        .innerJoin('companies as co', 'co.id', 'd.companyId')
        .select(['co.name as companyName', 'c.id as contactId', 'c.email', 'd.quoteId'])
        .where('d.id', '=', found.deliveryId)
        .executeTakeFirstOrThrow();
      // Idempotente: repetir la baja no crea exclusiones duplicadas.
      if (!(await hasEmailExclusion(trx, found.companyId, { id: d.contactId, email: d.email }))) {
        await registerExclusion(
          trx,
          { companyId: found.companyId, userId: null },
          {
            contactId: d.contactId,
            channel: 'email',
            reason: 'opt_out_request',
            notes: body['List-Unsubscribe'] === 'One-Click' ? 'Baja de un clic desde el cliente de correo' : 'Baja desde el enlace del email',
            via: 'unsubscribe_link',
            quoteId: d.quoteId,
          },
        );
      }
      return d.companyName;
    });
    return { message: `No recibirás más correos de seguimiento de ${companyName}.`, companyName };
  });
}
