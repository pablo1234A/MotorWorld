import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { can } from '../../domain/permissions.js';
import { allowedTransitions, QUOTE_STATUSES } from '../../domain/quote-status.js';
import { errors } from '../../lib/errors.js';
import { decodeCursor, pageOf } from '../../lib/pagination.js';
import {
  amountCents,
  idParams,
  isoDate,
  isoDateTime,
  optionalText,
  pagination,
  parseWith,
  requiredText,
  uuid,
} from '../../lib/validation.js';
import { cancelPendingRuleSteps } from '../../automation/engine.js';
import { inTenant } from '../../plugins/auth.js';
import { listActivity, logActivity } from '../activity/service.js';
import { contactInput, findOrCreateContact, getContact } from '../contacts/service.js';
import { escapeLike } from '../contacts/routes.js';
import { createFollowUp, createFollowUpBody, followUpDto, followUpQuery } from '../follow-ups/service.js';
import {
  assertMember,
  assertNotFuture,
  cancelPendingFollowUps,
  changeQuoteStatus,
  getQuoteRow,
  lockQuote,
  quoteDto,
  quoteQuery,
  quoteSummary,
  translateQuoteConflict,
} from './service.js';

const reference = z.string().trim().min(1).max(80).nullable();
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Moneda no válida (ISO 4217)');

const createBody = z
  .strictObject({
    title: requiredText(200),
    contactId: uuid.optional(),
    contact: contactInput.optional(),
    reference: reference.optional(),
    description: optionalText(10000).optional(),
    amountCents: amountCents.nullable().optional(),
    currency: currency.optional(),
    status: z.enum(['draft', 'sent']).default('sent'),
    sentAt: isoDateTime.optional(),
    validUntil: isoDate.nullable().optional(),
    ownerUserId: uuid.nullable().optional(),
  })
  .refine((b) => !!b.contactId !== !!b.contact, {
    path: ['contactId'],
    message: 'Indica un contacto existente (contactId) o los datos de uno nuevo (contact), pero no ambos',
  })
  .refine((b) => b.status === 'sent' || b.sentAt === undefined, {
    path: ['sentAt'],
    message: 'Un borrador no tiene fecha de envío',
  });

// Campos editables. El estado, la empresa, los resultados y las fechas de respuesta
// solo cambian mediante POST /quotes/:id/status.
const updateBody = z
  .strictObject({
    title: requiredText(200),
    contactId: uuid,
    reference,
    description: optionalText(10000),
    amountCents: amountCents.nullable(),
    currency,
    sentAt: isoDateTime,
    validUntil: isoDate.nullable(),
    ownerUserId: uuid.nullable(),
    autoFollowUpEnabled: z.boolean(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'No hay cambios');

const statusBody = z.strictObject({
  status: z.enum(QUOTE_STATUSES),
  occurredAt: isoDateTime.optional(),
  note: optionalText(500).optional(),
  evidence: z.string().trim().max(1000).optional(),
  acceptedAmountCents: amountCents.optional(),
  rejectionReason: optionalText(500).optional(),
});

const listQuery = z.strictObject({
  status: z
    .string()
    .transform((s) => s.split(',').map((v) => v.trim()))
    .pipe(z.array(z.enum(QUOTE_STATUSES)).min(1))
    .optional(),
  q: z.string().trim().max(100).optional(),
  ownerUserId: uuid.optional(),
  contactId: uuid.optional(),
  archived: z.enum(['false', 'true', 'all']).default('false'),
  ...pagination,
});

const activityQuery = z.strictObject({ ...pagination });
const followUpListQuery = z.strictObject({ status: z.enum(['pending', 'sending', 'sent', 'completed', 'failed', 'cancelled', 'all']).default('all') });

function assertValidity(sentAt: Date | null, validUntil: string | null | undefined) {
  if (sentAt && validUntil && validUntil < sentAt.toISOString().slice(0, 10)) {
    throw errors.validation('La validez no puede terminar antes del envío.', [{ path: 'validUntil', message: 'Anterior a la fecha de envío' }]);
  }
}

export async function quoteRoutes(app: FastifyInstance) {
  app.get('/', { config: { permission: 'quotes:read' } }, async (req) => {
    const q = parseWith(listQuery, req.query);
    const cursor = decodeCursor(q.cursor);
    return inTenant(app, req, async (trx, auth) => {
      let query = quoteQuery(trx, auth.companyId).orderBy('q.createdAt', 'desc').orderBy('q.id', 'desc').limit(q.limit + 1);
      if (q.status) query = query.where('q.status', 'in', q.status);
      if (q.ownerUserId) query = query.where('q.ownerUserId', '=', q.ownerUserId);
      if (q.contactId) query = query.where('q.contactId', '=', q.contactId);
      if (q.archived === 'false') query = query.where('q.archivedAt', 'is', null);
      if (q.archived === 'true') query = query.where('q.archivedAt', 'is not', null);
      if (q.q) {
        const pattern = `%${escapeLike(q.q)}%`;
        query = query.where((eb) => eb.or([eb('q.title', 'ilike', pattern), eb('q.reference', 'ilike', pattern), eb('c.fullName', 'ilike', pattern)]));
      }
      if (cursor) {
        query = query.where((eb) =>
          eb.or([eb('q.createdAt', '<', cursor.createdAt), eb.and([eb('q.createdAt', '=', cursor.createdAt), eb('q.id', '<', cursor.id)])]),
        );
      }
      const page = pageOf(await query.execute(), q.limit);
      return { items: page.items.map(quoteDto), nextCursor: page.nextCursor };
    });
  });

  app.get('/summary', { config: { permission: 'quotes:read' } }, async (req) =>
    inTenant(app, req, async (trx, auth) => ({ summary: await quoteSummary(trx, auth.companyId) })),
  );

  app.post('/', { config: { permission: 'quotes:write' } }, async (req, reply) => {
    const body = parseWith(createBody, req.body);
    const quote = await inTenant(app, req, async (trx, auth) => {
      const contact = body.contactId
        ? await getContact(trx, auth.companyId, body.contactId)
        : await findOrCreateContact(trx, auth, body.contact!);
      const ownerUserId = body.ownerUserId === undefined ? auth.userId : body.ownerUserId;
      if (ownerUserId) await assertMember(trx, auth.companyId, ownerUserId, 'ownerUserId');
      const sentAt = body.status === 'sent' ? (body.sentAt ?? new Date()) : null;
      if (sentAt) assertNotFuture(sentAt, 'sentAt');
      assertValidity(sentAt, body.validUntil);
      const company = await trx.selectFrom('companies').select('currency').where('id', '=', auth.companyId).executeTakeFirstOrThrow();

      const created = await trx
        .insertInto('quotes')
        .values({
          companyId: auth.companyId,
          contactId: contact.id,
          ownerUserId,
          reference: body.reference ?? null,
          title: body.title,
          description: body.description ?? null,
          amountCents: body.amountCents ?? null,
          currency: body.currency ?? company.currency,
          status: body.status,
          sentAt,
          validUntil: body.validUntil ?? null,
          lastFollowUpAt: null,
          respondedAt: null,
          reactivatedAt: null,
          acceptedAt: null,
          acceptanceConfirmedByUserId: null,
          acceptanceEvidence: null,
          acceptedAmountCents: null,
          rejectedAt: null,
          rejectionReason: null,
          archivedAt: null,
          externalSource: null,
          externalId: null,
          createdByUserId: auth.userId,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch(translateQuoteConflict);
      await logActivity(trx, auth, {
        action: 'quote.created',
        entityType: 'quote',
        entityId: created.id,
        quoteId: created.id,
        metadata: { status: body.status },
      });
      return getQuoteRow(trx, auth.companyId, created.id);
    });
    return reply.status(201).send({ quote: quoteDto(quote) });
  });

  app.get('/:id', { config: { permission: 'quotes:read' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    return inTenant(app, req, async (trx, auth) => {
      const quote = await getQuoteRow(trx, auth.companyId, id);
      const pending = await trx
        .selectFrom('followUps')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('companyId', '=', auth.companyId)
        .where('quoteId', '=', id)
        .where('status', '=', 'pending')
        .executeTakeFirstOrThrow();
      return {
        quote: quoteDto(quote),
        pendingFollowUps: Number(pending.n),
        allowedTransitions: quote.archivedAt ? [] : allowedTransitions(quote.status, can(auth.role, 'quotes:reopen')),
      };
    });
  });

  app.patch('/:id', { config: { permission: 'quotes:write' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    const body = parseWith(updateBody, req.body);
    return inTenant(app, req, async (trx, auth) => {
      const current = await lockQuote(trx, auth.companyId, id);
      if (current.archivedAt) throw errors.invalidTransition('El presupuesto está archivado. Desarchívalo para editarlo.');
      if (body.contactId) await getContact(trx, auth.companyId, body.contactId);
      if (body.ownerUserId) await assertMember(trx, auth.companyId, body.ownerUserId, 'ownerUserId');
      if (body.sentAt) {
        if (current.status === 'draft') {
          throw errors.validation('Un borrador no tiene fecha de envío. Cambia su estado a enviado.', [
            { path: 'sentAt', message: 'No aplicable a borradores' },
          ]);
        }
        assertNotFuture(body.sentAt, 'sentAt');
        if (current.respondedAt && body.sentAt > current.respondedAt) {
          throw errors.validation('El envío no puede ser posterior a la respuesta del cliente.', [
            { path: 'sentAt', message: 'Posterior a la respuesta' },
          ]);
        }
      }
      assertValidity(body.sentAt ?? current.sentAt, body.validUntil !== undefined ? body.validUntil : current.validUntil);

      await trx
        .updateTable('quotes')
        .set(body)
        .where('companyId', '=', auth.companyId)
        .where('id', '=', id)
        .execute()
        .catch(translateQuoteConflict);
      // Excluir el presupuesto del seguimiento automático detiene sus pasos pendientes.
      if (body.autoFollowUpEnabled === false) await cancelPendingRuleSteps(trx, auth.companyId, 'quote_auto_disabled', id);
      await logActivity(trx, auth, {
        action: 'quote.updated',
        entityType: 'quote',
        entityId: id,
        quoteId: id,
        metadata: { fields: Object.keys(body) },
      });
      return { quote: quoteDto(await getQuoteRow(trx, auth.companyId, id)) };
    });
  });

  app.post('/:id/status', { config: { permission: 'quotes:write' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    const body = parseWith(statusBody, req.body);
    return inTenant(app, req, async (trx, auth) => {
      const result = await changeQuoteStatus(trx, auth, id, body);
      return { quote: quoteDto(await getQuoteRow(trx, auth.companyId, id)), ...result };
    });
  });

  app.post('/:id/archive', { config: { permission: 'quotes:write' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    return inTenant(app, req, async (trx, auth) => {
      const quote = await lockQuote(trx, auth.companyId, id);
      if (quote.archivedAt) throw errors.invalidTransition('El presupuesto ya está archivado.');
      await trx.updateTable('quotes').set({ archivedAt: new Date() }).where('companyId', '=', auth.companyId).where('id', '=', id).execute();
      const cancelled = await cancelPendingFollowUps(trx, auth.companyId, id, 'quote_archived', { onlyContact: false });
      await logActivity(trx, auth, {
        action: 'quote.archived',
        entityType: 'quote',
        entityId: id,
        quoteId: id,
        metadata: { cancelledFollowUps: cancelled },
      });
      return { quote: quoteDto(await getQuoteRow(trx, auth.companyId, id)), cancelledFollowUps: cancelled };
    });
  });

  app.post('/:id/unarchive', { config: { permission: 'quotes:write' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    return inTenant(app, req, async (trx, auth) => {
      const quote = await lockQuote(trx, auth.companyId, id);
      if (!quote.archivedAt) throw errors.invalidTransition('El presupuesto no está archivado.');
      await trx.updateTable('quotes').set({ archivedAt: null }).where('companyId', '=', auth.companyId).where('id', '=', id).execute();
      await logActivity(trx, auth, { action: 'quote.unarchived', entityType: 'quote', entityId: id, quoteId: id });
      return { quote: quoteDto(await getQuoteRow(trx, auth.companyId, id)) };
    });
  });

  // Historial de una oportunidad
  app.get('/:id/activity', { config: { permission: 'activity:read' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    const q = parseWith(activityQuery, req.query);
    return inTenant(app, req, async (trx, auth) => {
      await getQuoteRow(trx, auth.companyId, id);
      return listActivity(trx, auth.companyId, { ...q, quoteId: id });
    });
  });

  app.get('/:id/follow-ups', { config: { permission: 'quotes:read' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    const q = parseWith(followUpListQuery, req.query);
    return inTenant(app, req, async (trx, auth) => {
      await getQuoteRow(trx, auth.companyId, id);
      let query = followUpQuery(trx, auth.companyId).where('f.quoteId', '=', id).orderBy('f.createdAt', 'desc').orderBy('f.id', 'desc');
      if (q.status !== 'all') query = query.where('f.status', '=', q.status);
      return { items: (await query.execute()).map(followUpDto) };
    });
  });

  app.post('/:id/follow-ups', { config: { permission: 'follow_ups:write' } }, async (req, reply) => {
    const { id } = parseWith(idParams, req.params);
    const body = parseWith(createFollowUpBody, req.body);
    const followUp = await inTenant(app, req, (trx, auth) => createFollowUp(trx, auth, id, body));
    return reply.status(201).send({ followUp });
  });
}
