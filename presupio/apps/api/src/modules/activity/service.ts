import type { Trx } from '../../db/database.js';
import { decodeCursor, pageOf } from '../../lib/pagination.js';

export interface ActivityInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  quoteId?: string | null;
  /** Solo datos necesarios para entender el cambio. Nunca contraseñas, tokens ni contenido de mensajes. */
  metadata?: Record<string, unknown>;
}

const FORBIDDEN_KEYS = /pass(word)?|token|secret|hash|cookie|authorization/i;

function sanitize(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_KEYS.test(key) || value === undefined) continue;
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

export async function logActivity(
  trx: Trx,
  ctx: { companyId: string; userId: string | null },
  input: ActivityInput,
): Promise<void> {
  await trx
    .insertInto('activityLog')
    .values({
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      quoteId: input.quoteId ?? null,
      metadata: JSON.stringify(sanitize(input.metadata ?? {})),
    })
    .execute();
}

export async function listActivity(
  trx: Trx,
  companyId: string,
  filters: { quoteId?: string; entityType?: string; limit: number; cursor?: string },
) {
  const cursor = decodeCursor(filters.cursor);
  let query = trx
    .selectFrom('activityLog as a')
    .leftJoin('users as u', 'u.id', 'a.actorUserId')
    .leftJoin('quotes as q', (join) => join.onRef('q.id', '=', 'a.quoteId').onRef('q.companyId', '=', 'a.companyId'))
    .select([
      'q.title as quoteTitle',
      'q.reference as quoteReference',
      'a.id',
      'a.action',
      'a.entityType',
      'a.entityId',
      'a.quoteId',
      'a.metadata',
      'a.createdAt',
      'a.actorUserId',
      'u.fullName as actorName',
    ])
    .where('a.companyId', '=', companyId)
    .orderBy('a.createdAt', 'desc')
    .orderBy('a.id', 'desc')
    .limit(filters.limit + 1);
  if (filters.quoteId) query = query.where('a.quoteId', '=', filters.quoteId);
  if (filters.entityType) query = query.where('a.entityType', '=', filters.entityType);
  if (cursor) {
    query = query.where((eb) =>
      eb.or([
        eb('a.createdAt', '<', cursor.createdAt),
        eb.and([eb('a.createdAt', '=', cursor.createdAt), eb('a.id', '<', cursor.id)]),
      ]),
    );
  }
  const rows = await query.execute();
  const page = pageOf(rows, filters.limit);
  return {
    items: page.items.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      quoteId: r.quoteId,
      quote: r.quoteId ? { id: r.quoteId, title: r.quoteTitle, reference: r.quoteReference } : null,
      metadata: r.metadata,
      actor: r.actorUserId ? { id: r.actorUserId, fullName: r.actorName } : null,
      createdAt: r.createdAt,
    })),
    nextCursor: page.nextCursor,
  };
}
