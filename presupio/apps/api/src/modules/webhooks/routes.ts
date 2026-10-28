import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { verifyMailgunSignature, sanitizeErrorDetail } from '../../automation/providers.js';
import { withTenant } from '../../db/database.js';
import { hashToken } from '../../lib/crypto.js';
import { logActivity } from '../activity/service.js';
import { hasEmailExclusion, registerExclusion } from '../exclusions/service.js';

const payloadSchema = z.object({
  signature: z.object({ timestamp: z.string().max(20), token: z.string().min(1).max(200), signature: z.string().max(128) }),
  'event-data': z
    .object({
      event: z.string().max(40),
      severity: z.string().max(20).optional(),
      reason: z.string().max(100).optional(),
      'user-variables': z.record(z.string(), z.unknown()).optional(),
      message: z.object({ headers: z.object({ 'message-id': z.string().max(300).optional() }).partial().optional() }).partial().optional(),
      'delivery-status': z.object({ code: z.union([z.number(), z.string()]).optional(), message: z.string().optional(), description: z.string().optional() }).partial().optional(),
    })
    .passthrough(),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Webhooks de Mailgun. Solo se acepta lo firmado con la clave de firma de webhooks, cada
 * token una única vez, y solo se registran estados que el proveedor confirma:
 * entregado, fallo permanente (rebote), queja por spam y baja.
 */
export async function webhookRoutes(app: FastifyInstance) {
  app.post('/mailgun', { config: { auth: 'none' } }, async (req, reply) => {
    const signingKey = app.config.automation.mailgun?.webhookSigningKey;
    if (app.followUpProvider.name !== 'mailgun' || !signingKey) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });

    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success || !verifyMailgunSignature(signingKey, parsed.data.signature)) {
      req.log.warn('Webhook de Mailgun con firma no válida');
      return reply.status(401).send({ error: { code: 'INVALID_SIGNATURE', message: 'Firma no válida.' } });
    }
    const { signature, 'event-data': event } = parsed.data;

    // Antirrepetición: el mismo token firmado no se procesa dos veces.
    const fresh = await app.db
      .insertInto('webhookEvents')
      .values({ provider: 'mailgun', tokenHash: hashToken(signature.token), eventType: event.event, deliveryId: null })
      .onConflict((oc) => oc.doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!fresh) return { status: 'duplicate' };

    const messageId = event.message?.headers?.['message-id']?.replace(/^<|>$/g, '') ?? null;
    const variableId = event['user-variables']?.presupio_delivery_id;
    const deliveryRef = typeof variableId === 'string' && UUID.test(variableId) ? variableId : null;
    const { rows } = await sql<{ deliveryId: string; companyId: string }>`
      select delivery_id as "deliveryId", company_id as "companyId"
      from app_find_delivery_for_webhook('mailgun', ${messageId}, ${deliveryRef}::uuid)`.execute(app.db);
    const found = rows[0];
    if (!found) return { status: 'ignored' };
    await app.db.updateTable('webhookEvents').set({ deliveryId: found.deliveryId }).where('id', '=', fresh.id).execute();

    await withTenant(app.db, { companyId: found.companyId, userId: null }, async (trx) => {
      const d = await trx
        .selectFrom('messageDeliveries')
        .selectAll()
        .where('companyId', '=', found.companyId)
        .where('id', '=', found.deliveryId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const contact = await trx.selectFrom('contacts').select(['id', 'email']).where('companyId', '=', found.companyId).where('id', '=', d.contactId).executeTakeFirstOrThrow();
      const ctx = { companyId: found.companyId, userId: null };
      const now = new Date();

      switch (event.event) {
        case 'delivered':
          if (d.status === 'sent') {
            await trx.updateTable('messageDeliveries').set({ status: 'delivered', deliveredAt: now }).where('id', '=', d.id).execute();
          }
          break;
        case 'failed':
          // Los fallos temporales los reintenta el propio proveedor: no cambian nada aquí.
          if (event.severity !== 'permanent') break;
          await trx
            .updateTable('messageDeliveries')
            .set({
              status: 'failed',
              failedAt: now,
              errorCode: 'bounced',
              errorDetail: sanitizeErrorDetail(event['delivery-status']?.description || event['delivery-status']?.message || event.reason || 'Rebote permanente') || null,
            })
            .where('id', '=', d.id)
            .execute();
          await logActivity(trx, ctx, { action: 'follow_up.bounced', entityType: 'follow_up', entityId: d.followUpId, quoteId: d.quoteId, metadata: { channel: 'email' } });
          if (!(await hasEmailExclusion(trx, found.companyId, contact))) {
            await registerExclusion(trx, ctx, { contactId: contact.id, channel: 'email', reason: 'bounced', notes: 'Rebote permanente comunicado por el proveedor', via: 'provider_webhook', quoteId: d.quoteId });
          }
          break;
        case 'complained':
        case 'unsubscribed':
          if (!(await hasEmailExclusion(trx, found.companyId, contact))) {
            await registerExclusion(trx, ctx, {
              contactId: contact.id,
              channel: 'email',
              reason: 'opt_out_request',
              notes: event.event === 'complained' ? 'El destinatario marcó el correo como spam' : 'Baja comunicada por el proveedor',
              via: 'provider_webhook',
              quoteId: d.quoteId,
            });
          }
          break;
        default:
          break;
      }
    });
    return { status: 'processed' };
  });
}
