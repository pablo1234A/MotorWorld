import { sql } from 'kysely';
import { withTenant, type Trx } from '../db/database.js';
import { logActivity } from '../modules/activity/service.js';
import { countUnverifiedAttempt, releaseUnverifiedAttempt } from '../modules/usage/service.js';
import type { EngineDeps } from './engine.js';

/*
 * Envíos de «resultado desconocido» (el proceso se detuvo después de llamar al proveedor).
 * Nunca se reenvían a ciegas ni se dan por fallidos sin prueba: se reconcilian con el
 * proveedor cuando es posible o los resuelve una persona, y todo queda en el historial.
 */

export type UnknownResolution = 'sent' | 'not_sent' | 'provider_sent' | 'provider_not_sent';

/**
 * Resuelve el envío desconocido más reciente de un seguimiento. Devuelve null si no hay
 * ninguno pendiente. Con «enviado», el intento se cuenta si cabe en el límite de su periodo.
 */
export async function resolveUnknownDelivery(
  trx: Trx,
  ctx: { companyId: string; userId: string | null },
  followUpId: string,
  outcome: UnknownResolution,
  now = new Date(),
): Promise<{ outcome: UnknownResolution; attemptCounted: boolean } | null> {
  const d = await trx
    .selectFrom('messageDeliveries')
    .select(['id', 'followUpId', 'quoteId', 'providerCallStartedAt', 'createdAt'])
    .where('companyId', '=', ctx.companyId)
    .where('followUpId', '=', followUpId)
    .where('status', '=', 'unknown')
    .where('reviewedAt', 'is', null)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .forUpdate()
    .executeTakeFirst();
  if (!d) return null;
  const review = { reviewedAt: now, reviewOutcome: outcome, reviewedByUserId: ctx.userId };
  let attemptCounted = false;
  if (outcome === 'sent' || outcome === 'provider_sent') {
    const sentAt = d.providerCallStartedAt ?? d.createdAt;
    await trx.updateTable('messageDeliveries').set({ ...review, status: 'sent', sentAt, errorCode: null, errorDetail: null }).where('id', '=', d.id).execute();
    await trx
      .updateTable('followUps')
      .set({ status: 'sent', sentAt, failureReason: null })
      .where('companyId', '=', ctx.companyId)
      .where('id', '=', followUpId)
      .where('status', '=', 'unknown')
      .execute();
    await trx
      .updateTable('quotes')
      .set((eb) => ({ lastFollowUpAt: eb.fn('greatest', [eb.ref('lastFollowUpAt'), eb.val(sentAt)]) }))
      .where('companyId', '=', ctx.companyId)
      .where('id', '=', d.quoteId)
      .execute();
    attemptCounted = await countUnverifiedAttempt(trx, ctx.companyId, followUpId, d.id, sentAt);
  } else {
    await trx
      .updateTable('messageDeliveries')
      .set({ ...review, status: 'failed', failedAt: now, errorCode: 'not_sent_confirmed', errorDetail: 'Confirmado que el email no se envió' })
      .where('id', '=', d.id)
      .execute();
    await trx
      .updateTable('followUps')
      .set({ status: 'failed', failureReason: 'not_sent_confirmed' })
      .where('companyId', '=', ctx.companyId)
      .where('id', '=', followUpId)
      .where('status', '=', 'unknown')
      .execute();
    await releaseUnverifiedAttempt(trx, ctx.companyId, followUpId, 'not_sent_confirmed', now);
  }
  await logActivity(trx, ctx, {
    action: 'follow_up.unknown_resolved',
    entityType: 'follow_up',
    entityId: followUpId,
    quoteId: d.quoteId,
    metadata: { outcome, attemptCounted, byProvider: outcome.startsWith('provider_') },
  });
  return { outcome, attemptCounted };
}

/**
 * Reconciliación automática con el proveedor (si permite consultar sus eventos). Lo que el
 * proveedor no confirma ni descarta sigue pendiente de revisión manual (alerta en /ops/status).
 */
export async function reconcileUnknownDeliveries(deps: EngineDeps): Promise<{ checked: number; sent: number; notSent: number }> {
  const stats = { checked: 0, sent: 0, notSent: 0 };
  const lookup = deps.provider.lookup?.bind(deps.provider);
  if (!lookup) return stats;
  const now = deps.now?.() ?? new Date();
  const { rows } = await sql<{ id: string }>`select app_companies_with_unknown_deliveries() as id`.execute(deps.db);
  for (const { id: companyId } of rows) {
    const pending = await withTenant(deps.db, { companyId, userId: null }, (trx) =>
      trx
        .selectFrom('messageDeliveries')
        .select(['id', 'followUpId', 'recipient', 'providerCallStartedAt', 'createdAt'])
        .where('companyId', '=', companyId)
        .where('status', '=', 'unknown')
        .where('reviewedAt', 'is', null)
        .where('provider', '=', deps.provider.name)
        .limit(50)
        .execute(),
    );
    for (const d of pending) {
      stats.checked++;
      const result = await lookup({ deliveryId: d.id, recipient: d.recipient, calledAt: d.providerCallStartedAt ?? d.createdAt });
      if (result === 'not_found') continue;
      await withTenant(deps.db, { companyId, userId: null }, (trx) =>
        resolveUnknownDelivery(trx, { companyId, userId: null }, d.followUpId, result === 'accepted' ? 'provider_sent' : 'provider_not_sent', now),
      );
      if (result === 'accepted') stats.sent++;
      else stats.notSent++;
    }
  }
  return stats;
}
