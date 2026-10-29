import { sql } from 'kysely';
import type { Trx } from '../../db/database.js';
import { errors } from '../../lib/errors.js';
import { logActivity } from '../activity/service.js';

/*
 * Supresión de datos personales (derecho de supresión, RGPD) de un contacto o de un
 * presupuesto. Es una anonimización IRREVERSIBLE (migración 0008):
 *  - se borran nombre, email, teléfono, notas, contenido y destinatario de los emails,
 *    evidencias y notas libres del historial;
 *  - se conservan las filas sin datos personales (intentos facturados, métricas, historial);
 *  - los seguimientos pendientes se cancelan y el motor ya no puede usarlos (sin email, sin
 *    presupuesto activo);
 *  - las exclusiones ACTIVAS se conservan para seguir respetando una baja.
 * Si alguna obligación legal exige conservar algún dato concreto, debe validarse antes con
 * asesoría jurídica (docs/legal/README.md).
 */

type Ctx = { companyId: string; userId: string | null };

const ANON_NAME = 'Contacto anonimizado';
const ANON_RECIPIENT = '[suprimido]';

async function cancelPendingFor(trx: Trx, companyId: string, quoteIds: string[], reason: string, now: Date): Promise<number> {
  if (!quoteIds.length) return 0;
  const cancelled = await trx
    .updateTable('followUps')
    .set({ status: 'cancelled', cancelledAt: now, cancelReason: reason })
    .where('companyId', '=', companyId)
    .where('quoteId', 'in', quoteIds)
    .where('status', '=', 'pending')
    .returning('id')
    .execute();
  return cancelled.length;
}

/** Borra el texto libre de los seguimientos y el contenido y destinatario de los emails. */
async function scrubFollowUpsAndDeliveries(trx: Trx, companyId: string, quoteIds: string[], now: Date): Promise<void> {
  if (!quoteIds.length) return;
  await trx.updateTable('followUps').set({ notes: null }).where('companyId', '=', companyId).where('quoteId', 'in', quoteIds).execute();
  // La instantánea de un email aprobado es obligatoria si hay aprobación
  // (follow_ups_approval_snapshot): se sustituye su texto por un marcador.
  await trx
    .updateTable('followUps')
    .set({ approvedSubject: '[suprimido]', approvedBody: '[suprimido]' })
    .where('companyId', '=', companyId)
    .where('quoteId', 'in', quoteIds)
    .where('approvedAt', 'is not', null)
    .execute();
  await trx
    .updateTable('messageDeliveries')
    .set({ recipient: ANON_RECIPIENT, subject: null, bodyText: null, contentPurgedAt: now, errorDetail: null })
    .where('companyId', '=', companyId)
    .where('quoteId', 'in', quoteIds)
    .execute();
  await sql`select app_scrub_activity_notes(${sql.val(quoteIds)}::uuid[])`.execute(trx);
}

export async function anonymizeContact(trx: Trx, ctx: Ctx, contactId: string, now = new Date()) {
  const contact = await trx
    .selectFrom('contacts')
    .select(['id', 'anonymizedAt', 'email', 'phone'])
    .where('companyId', '=', ctx.companyId)
    .where('id', '=', contactId)
    .forUpdate()
    .executeTakeFirst();
  if (!contact || contact.anonymizedAt) throw errors.notFound('Contacto no encontrado.');
  const quotes = await trx.selectFrom('quotes').select('id').where('companyId', '=', ctx.companyId).where('contactId', '=', contactId).forUpdate().execute();
  const quoteIds = quotes.map((q) => q.id);
  const cancelled = await cancelPendingFor(trx, ctx.companyId, quoteIds, 'contact_anonymized', now);
  if (quoteIds.length) {
    await trx.updateTable('quotes').set({ autoFollowUpEnabled: false }).where('companyId', '=', ctx.companyId).where('id', 'in', quoteIds).execute();
    // Las evidencias de venta y los motivos de rechazo son texto libre que puede identificar a la persona.
    await trx
      .updateTable('quotes')
      .set({ acceptanceEvidence: 'Evidencia suprimida (datos personales)' })
      .where('companyId', '=', ctx.companyId)
      .where('id', 'in', quoteIds)
      .where('acceptanceEvidence', 'is not', null)
      .execute();
    await trx.updateTable('quotes').set({ rejectionReason: null }).where('companyId', '=', ctx.companyId).where('id', 'in', quoteIds).execute();
  }
  await scrubFollowUpsAndDeliveries(trx, ctx.companyId, quoteIds, now);
  // Exclusiones: las ACTIVAS conservan el email o teléfono (lista de supresión: sin ellos no se
  // podría respetar la baja si alguien vuelve a introducir a la persona). Las levantadas ya no
  // tienen esa finalidad y pierden sus datos. Las notas libres se borran en ambos casos.
  await trx.updateTable('contactExclusions').set({ notes: null, liftReason: null }).where('companyId', '=', ctx.companyId).where('contactId', '=', contactId).execute();
  await trx
    .updateTable('contactExclusions')
    .set({ email: null, phone: null })
    .where('companyId', '=', ctx.companyId)
    .where('contactId', '=', contactId)
    .where('liftedAt', 'is not', null)
    .execute();
  // Minimización: una exclusión activa solo guarda el dato de su canal (email para email;
  // teléfono para teléfono, WhatsApp y SMS; ambos si excluye todos los canales).
  await trx
    .updateTable('contactExclusions')
    .set({ phone: null })
    .where('companyId', '=', ctx.companyId)
    .where('contactId', '=', contactId)
    .where('liftedAt', 'is', null)
    .where('channel', '=', 'email')
    .execute();
  await trx
    .updateTable('contactExclusions')
    .set({ email: null })
    .where('companyId', '=', ctx.companyId)
    .where('contactId', '=', contactId)
    .where('liftedAt', 'is', null)
    .where('channel', 'in', ['phone', 'whatsapp', 'sms'])
    .execute();
  await trx
    .updateTable('contacts')
    .set({ fullName: ANON_NAME, email: null, phone: null, organization: null, notes: null, preferredChannel: null, anonymizedAt: now })
    .where('companyId', '=', ctx.companyId)
    .where('id', '=', contactId)
    .execute();
  await logActivity(trx, ctx, { action: 'contact.anonymized', entityType: 'contact', entityId: contactId, metadata: { quotes: quoteIds.length, cancelledFollowUps: cancelled } });
  return { quotes: quoteIds.length, cancelledFollowUps: cancelled };
}

export async function eraseQuote(trx: Trx, ctx: Ctx, quoteId: string, now = new Date()) {
  const quote = await trx
    .selectFrom('quotes')
    .select(['id', 'deletedAt', 'status', 'acceptanceEvidence'])
    .where('companyId', '=', ctx.companyId)
    .where('id', '=', quoteId)
    .forUpdate()
    .executeTakeFirst();
  if (!quote || quote.deletedAt) throw errors.notFound('Presupuesto no encontrado.');
  const cancelled = await cancelPendingFor(trx, ctx.companyId, [quoteId], 'quote_deleted', now);
  await scrubFollowUpsAndDeliveries(trx, ctx.companyId, [quoteId], now);
  await trx
    .updateTable('quotes')
    .set({
      title: 'Presupuesto eliminado',
      description: null,
      reference: null,
      externalId: null,
      externalSource: null,
      rejectionReason: null,
      ...(quote.acceptanceEvidence ? { acceptanceEvidence: 'Evidencia suprimida (datos personales)' } : {}),
      archivedAt: now,
      autoFollowUpEnabled: false,
      deletedAt: now,
    })
    .where('companyId', '=', ctx.companyId)
    .where('id', '=', quoteId)
    .execute();
  await logActivity(trx, ctx, { action: 'quote.deleted', entityType: 'quote', entityId: quoteId, quoteId, metadata: { cancelledFollowUps: cancelled } });
  return { cancelledFollowUps: cancelled };
}
