import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errors } from '../../lib/errors.js';
import { decodeCursor, pageOf } from '../../lib/pagination.js';
import { email, idParams, optionalText, pagination, parseWith, phone, requiredText } from '../../lib/validation.js';
import { inTenant } from '../../plugins/auth.js';
import { logActivity } from '../activity/service.js';
import { anonymizeContact } from '../privacy/service.js';
import { CONTACT_FIELDS, contactChannel, contactInput, createContact, getContact, translateContactConflict } from './service.js';

const listQuery = z.strictObject({ q: z.string().trim().max(100).optional(), ...pagination });

const updateBody = z
  .strictObject({
    fullName: requiredText(160),
    email: email.nullable(),
    phone: phone.nullable(),
    organization: optionalText(160),
    preferredChannel: contactChannel.nullable(),
    notes: optionalText(5000),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'No hay cambios');

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function contactRoutes(app: FastifyInstance) {
  app.get('/', { config: { permission: 'contacts:read' } }, async (req) => {
    const q = parseWith(listQuery, req.query);
    const cursor = decodeCursor(q.cursor);
    return inTenant(app, req, async (trx, auth) => {
      let query = trx
        .selectFrom('contacts')
        .select(CONTACT_FIELDS)
        .where('companyId', '=', auth.companyId)
        .where('anonymizedAt', 'is', null)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .limit(q.limit + 1);
      if (q.q) {
        const pattern = `%${escapeLike(q.q)}%`;
        query = query.where((eb) =>
          eb.or([eb('fullName', 'ilike', pattern), eb('email', 'ilike', pattern), eb('phone', 'like', pattern), eb('organization', 'ilike', pattern)]),
        );
      }
      if (cursor) {
        query = query.where((eb) =>
          eb.or([eb('createdAt', '<', cursor.createdAt), eb.and([eb('createdAt', '=', cursor.createdAt), eb('id', '<', cursor.id)])]),
        );
      }
      return pageOf(await query.execute(), q.limit);
    });
  });

  app.post('/', { config: { permission: 'contacts:write' } }, async (req, reply) => {
    const body = parseWith(contactInput, req.body);
    const contact = await inTenant(app, req, (trx, auth) => createContact(trx, auth, body));
    const { companyId: _c, createdByUserId: _u, ...dto } = contact;
    return reply.status(201).send({ contact: dto });
  });

  app.get('/:id', { config: { permission: 'contacts:read' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    return inTenant(app, req, async (trx, auth) => {
      const { companyId: _c, createdByUserId: _u, ...contact } = await getContact(trx, auth.companyId, id);
      const [exclusions, quotes] = await Promise.all([
        trx
          .selectFrom('contactExclusions')
          .select(['id', 'channel', 'reason', 'createdAt'])
          .where('companyId', '=', auth.companyId)
          .where('liftedAt', 'is', null)
          .where((eb) => {
            const t = [eb('contactId', '=', id)];
            if (contact.email) t.push(eb('email', '=', contact.email));
            if (contact.phone) t.push(eb('phone', '=', contact.phone));
            return eb.or(t);
          })
          .execute(),
        trx
          .selectFrom('quotes')
          .select(['id', 'title', 'reference', 'status', 'amountCents', 'sentAt', 'archivedAt'])
          .where('companyId', '=', auth.companyId)
          .where('contactId', '=', id)
          .where('deletedAt', 'is', null)
          .orderBy('createdAt', 'desc')
          .limit(50)
          .execute(),
      ]);
      return { contact, activeExclusions: exclusions, quotes };
    });
  });

  /**
   * Supresión de los datos personales del contacto (derecho de supresión). Irreversible:
   * exige confirmar escribiendo ANONIMIZAR. Disponible también en solo lectura (una petición
   * de supresión debe atenderse aunque la cuenta no tenga plan activo).
   */
  app.post('/:id/anonymize', { config: { permission: 'data:erase', readOnlyAllowed: true } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    parseWith(z.strictObject({ confirm: z.literal('ANONIMIZAR', 'Escribe ANONIMIZAR para confirmar') }), req.body);
    return inTenant(app, req, async (trx, auth) => ({ anonymized: await anonymizeContact(trx, auth, id) }));
  });

  app.patch('/:id', { config: { permission: 'contacts:write' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    const body = parseWith(updateBody, req.body);
    return inTenant(app, req, async (trx, auth) => {
      const current = await getContact(trx, auth.companyId, id);
      const nextEmail = body.email !== undefined ? body.email : current.email;
      const nextPhone = body.phone !== undefined ? body.phone : current.phone;
      if (!nextEmail && !nextPhone) {
        throw errors.validation('Indica al menos un email o un teléfono.', [{ path: 'email', message: 'Indica al menos un email o un teléfono' }]);
      }
      const contact = await trx
        .updateTable('contacts')
        .set(body)
        .where('companyId', '=', auth.companyId)
        .where('id', '=', id)
        .returning(CONTACT_FIELDS)
        .executeTakeFirstOrThrow()
        .catch(translateContactConflict);
      await logActivity(trx, auth, {
        action: 'contact.updated',
        entityType: 'contact',
        entityId: id,
        metadata: { fields: Object.keys(body) },
      });
      return { contact };
    });
  });
}
