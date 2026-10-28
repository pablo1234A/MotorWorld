import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { decodeCursor, pageOf } from '../../lib/pagination.js';
import { idParams, isoDateTime, optionalText, pagination, parseWith, requiredText, uuid } from '../../lib/validation.js';
import { currentTemplate, loadCompanyContext, templateValues } from '../../automation/engine.js';
import { composeMessage, renderBody } from '../../automation/templates.js';
import type { Trx } from '../../db/database.js';
import { errors } from '../../lib/errors.js';
import { inTenant } from '../../plugins/auth.js';
import { logActivity } from '../activity/service.js';
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
  status: z.enum(['pending', 'sending', 'sent', 'completed', 'failed', 'cancelled', 'all']).default('pending'),
  approval: z.enum(['awaiting']).optional(),
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
      if (q.approval === 'awaiting') {
        query = query.where('f.source', '=', 'rule').where('f.status', '=', 'pending').where('f.approvedAt', 'is', null);
      }
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

/** Contenido de un email automático: el aprobado (instantánea) o el que se enviaría ahora. */
async function automaticMessage(trx: Trx, companyId: string, id: string) {
  const f = await trx.selectFrom('followUps').selectAll().where('companyId', '=', companyId).where('id', '=', id).executeTakeFirst();
  if (!f) throw errors.notFound('Seguimiento no encontrado.');
  if (f.source !== 'rule') throw errors.invalidTransition('Solo los emails automáticos tienen vista previa.');
  const ctx = await loadCompanyContext(trx, companyId, new Date());
  const quote = await trx.selectFrom('quotes').selectAll().where('companyId', '=', companyId).where('id', '=', f.quoteId).executeTakeFirstOrThrow();
  const contact = await trx.selectFrom('contacts').selectAll().where('companyId', '=', companyId).where('id', '=', quote.contactId).executeTakeFirstOrThrow();
  const template = await currentTemplate(trx, companyId, f.sequenceStep!);
  const rendered = f.approvedAt ? { subject: f.approvedSubject!, body: f.approvedBody! } : renderBody(template, templateValues(ctx, quote, contact));
  return { f, ctx, contact, template, rendered };
}

export async function automaticFollowUpRoutes(app: FastifyInstance) {
  app.get('/:id/preview', { config: { permission: 'quotes:read' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    return inTenant(app, req, async (trx, auth) => {
      const { f, ctx, contact, template, rendered } = await automaticMessage(trx, auth.companyId, id);
      const message = composeMessage(rendered.subject, rendered.body, ctx.sender, 'https://… (enlace personal de baja)');
      return {
        preview: {
          to: contact.email,
          replyTo: ctx.replyTo,
          subject: message.subject,
          body: rendered.body,
          text: message.text,
          approved: !!f.approvedAt,
          templateStep: template.step,
          templateVersion: f.approvedAt ? null : template.version,
        },
      };
    });
  });

  /** Aprobar: se guarda una instantánea del mensaje; eso es exactamente lo que se enviará. */
  app.post('/:id/approve', { config: { permission: 'follow_ups:write' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    return inTenant(app, req, async (trx, auth) => {
      const locked = await trx.selectFrom('followUps').select(['id', 'status', 'source', 'approvedAt']).where('companyId', '=', auth.companyId).where('id', '=', id).forUpdate().executeTakeFirst();
      if (!locked) throw errors.notFound('Seguimiento no encontrado.');
      if (locked.source !== 'rule') throw errors.invalidTransition('Solo se aprueban los emails automáticos.');
      if (locked.status !== 'pending') throw errors.invalidTransition('Este email ya no está pendiente.');
      const { f, contact, template, rendered } = await automaticMessage(trx, auth.companyId, id);
      if (!contact.email) throw errors.invalidTransition('El contacto no tiene email.');
      if (!f.approvedAt) {
        await trx
          .updateTable('followUps')
          .set({
            approvedAt: new Date(),
            approvedByUserId: auth.userId,
            approvedTemplateVersionId: template.id,
            approvedSubject: rendered.subject,
            approvedBody: rendered.body,
          })
          .where('companyId', '=', auth.companyId)
          .where('id', '=', id)
          .execute();
        await logActivity(trx, auth, {
          action: 'follow_up.approved',
          entityType: 'follow_up',
          entityId: id,
          quoteId: f.quoteId,
          metadata: { step: f.sequenceStep, templateVersion: template.version },
        });
      }
      return { followUp: await getFollowUp(trx, auth.companyId, id) };
    });
  });

  /** Intentos de envío de un seguimiento (trazabilidad). */
  app.get('/:id/deliveries', { config: { permission: 'quotes:read' } }, async (req) => {
    const { id } = parseWith(idParams, req.params);
    return inTenant(app, req, async (trx, auth) => {
      await getFollowUp(trx, auth.companyId, id);
      return {
        items: await trx
          .selectFrom('messageDeliveries')
          .select([
            'id',
            'attemptNumber',
            'status',
            'channel',
            'provider',
            'providerMessageId',
            'recipient',
            'subject',
            'bodyText',
            'contentPurgedAt',
            'templateStep',
            'templateVersion',
            'errorCode',
            'errorDetail',
            'createdAt',
            'sentAt',
            'deliveredAt',
            'failedAt',
          ])
          .where('companyId', '=', auth.companyId)
          .where('followUpId', '=', id)
          .orderBy('attemptNumber', 'asc')
          .execute(),
      };
    });
  });
}
