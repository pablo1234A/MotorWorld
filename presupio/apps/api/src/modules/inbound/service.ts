import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { withTenant, type Db, type Trx } from '../../db/database.js';
import type { AuthContext } from '../../plugins/auth.js';
import { logActivity } from '../activity/service.js';
import { changeQuoteStatus } from '../quotes/service.js';

/*
 * Detección de respuestas de clientes (correo entrante). Independiente del proveedor: el
 * adaptador (p. ej. Mailgun, routes.ts) verifica la autenticidad y entrega un InboundEmail.
 *
 * Seguridad:
 *  - La empresa se identifica por el token de su dirección de entrada; todo lo demás se busca
 *    DENTRO de esa empresa (RLS): una respuesta nunca puede tocar datos de otra.
 *  - El mismo mensaje (Message-Id) se procesa una sola vez.
 *  - No se guarda el contenido: solo qué presupuesto, cómo se emparejó y qué se hizo.
 *  - Las respuestas automáticas (fuera de la oficina…) y los rebotes NO cuentan como respuesta.
 */

export interface InboundEmail {
  recipients: string[];
  sender: string | null;
  subject: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  date: Date | null;
  /** Cabeceras en minúsculas (solo las necesarias para clasificar). */
  headers: Record<string, string>;
}

export type InboundOutcome = 'responded' | 'already_answered' | 'auto_reply' | 'bounce' | 'unmatched' | 'ignored';

const AUTO_SUBJECT = /(fuera de la oficina|respuesta autom[aá]tica|auto(matic)?[ -]?reply|out of (the )?office|ausencia|vacaciones|autorespuesta|delivery status notification|undeliverable|no se ha podido entregar)/i;

/** Respuesta automática o rebote: no son respuestas del cliente. */
export function classifyInbound(email: InboundEmail): 'reply' | 'auto_reply' | 'bounce' {
  const h = email.headers;
  const sender = (email.sender ?? '').toLowerCase();
  if (/^(mailer-daemon|postmaster)@/.test(sender) || (h['content-type'] ?? '').includes('multipart/report')) return 'bounce';
  const auto = h['auto-submitted'];
  if (auto && auto.toLowerCase() !== 'no') return 'auto_reply';
  if (h['x-autoreply'] || h['x-autorespond'] || h['x-autoresponder']) return 'auto_reply';
  if (/^(auto_reply|bulk|junk|list)$/i.test(h['precedence'] ?? '')) return 'auto_reply';
  if (AUTO_SUBJECT.test(email.subject)) return 'auto_reply';
  return 'reply';
}

/** Token de empresa de la dirección de entrada (respuestas+<token>@dominio). */
export function inboundTokenFrom(recipients: string[], domain: string): string | null {
  const re = new RegExp(`(?:^|[\\s<,])respuestas\\+([0-9a-f]{32})@${domain.replace(/\./g, '\\.')}(?:$|[\\s>,])`, 'i');
  for (const r of recipients) {
    const m = re.exec(` ${r} `);
    if (m) return m[1]!.toLowerCase();
  }
  return null;
}

export function inboundAddress(token: string, domain: string): string {
  return `respuestas+${token}@${domain}`;
}

/** Identificadores de mensaje citados en In-Reply-To y References (sin < >). */
export function referencedIds(email: Pick<InboundEmail, 'inReplyTo' | 'references'>): string[] {
  const raw = `${email.inReplyTo ?? ''} ${email.references ?? ''}`;
  const ids = [...raw.matchAll(/<([^<>\s]{1,300})>/g)].map((m) => m[1]!);
  return [...new Set(ids)].slice(0, 50);
}

const UUID_ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

async function findDelivery(trx: Trx, companyId: string, email: InboundEmail) {
  const ids = referencedIds(email);
  if (ids.length) {
    const uuids = ids.map((id) => UUID_ID.exec(id)?.[1]).filter((v): v is string => !!v);
    const found = await trx
      .selectFrom('messageDeliveries')
      .select(['id', 'quoteId', 'sentAt'])
      .where('companyId', '=', companyId)
      .where((eb) => eb.or([eb('providerMessageId', 'in', ids), ...(uuids.length ? [eb('id', 'in', uuids)] : [])]))
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (found) return { ...found, method: 'message_id' as const };
  }
  // Sin cabeceras de respuesta reconocibles: el remitente coincide con un contacto al que se
  // envió un email automático en los últimos 60 días (el presupuesto más reciente).
  const sender = email.sender?.toLowerCase().trim();
  if (sender && /^[^\s@]+@[^\s@]+$/.test(sender)) {
    const found = await trx
      .selectFrom('messageDeliveries as d')
      .innerJoin('contacts as c', (j) => j.onRef('c.id', '=', 'd.contactId').onRef('c.companyId', '=', 'd.companyId'))
      .select(['d.id', 'd.quoteId', 'd.sentAt'])
      .where('d.companyId', '=', companyId)
      .where('c.email', '=', sender)
      .where('d.createdAt', '>', new Date(Date.now() - 60 * 86_400_000))
      .orderBy('d.createdAt', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (found) return { ...found, method: 'sender' as const };
  }
  return null;
}

/** Procesa un email entrante ya autenticado. Devuelve qué se hizo (o 'duplicate'). */
export async function processInboundEmail(
  db: Db,
  input: { provider: string; domain: string; email: InboundEmail },
): Promise<{ status: InboundOutcome | 'duplicate' | 'unknown_recipient' }> {
  const { email } = input;
  const token = inboundTokenFrom(email.recipients, input.domain);
  if (!token) return { status: 'unknown_recipient' };
  const { rows } = await sql<{ id: string | null }>`select app_find_company_by_inbound_token(${token}) as id`.execute(db);
  const companyId = rows[0]?.id;
  if (!companyId) return { status: 'unknown_recipient' };

  const messageIdHash = sha256(email.messageId ?? `${email.sender}|${email.date?.toISOString()}|${email.subject}`);
  const senderDomain = email.sender?.split('@')[1]?.toLowerCase().slice(0, 253) ?? null;
  return withTenant(db, { companyId, userId: null }, async (trx) => {
    const seen = await trx.selectFrom('inboundReplies').select('id').where('companyId', '=', companyId).where('messageIdHash', '=', messageIdHash).executeTakeFirst();
    if (seen) return { status: 'duplicate' as const };
    const record = async (outcome: InboundOutcome, method: 'message_id' | 'sender' | 'none', match?: { id: string; quoteId: string }) => {
      const inserted = await trx
        .insertInto('inboundReplies')
        .values({ companyId, quoteId: match?.quoteId ?? null, deliveryId: match?.id ?? null, provider: input.provider, messageIdHash, matchMethod: method, outcome, senderDomain })
        .onConflict((oc) => oc.columns(['companyId', 'messageIdHash']).doNothing())
        .returning('id')
        .executeTakeFirst();
      return { status: inserted ? outcome : ('duplicate' as const) };
    };

    const kind = classifyInbound(email);
    if (kind !== 'reply') return record(kind, 'none');
    const match = await findDelivery(trx, companyId, email);
    if (!match) return record('unmatched', 'none');

    const quote = await trx
      .selectFrom('quotes')
      .select(['id', 'status', 'sentAt', 'archivedAt', 'deletedAt'])
      .where('companyId', '=', companyId)
      .where('id', '=', match.quoteId)
      .forUpdate()
      .executeTakeFirst();
    if (!quote || quote.deletedAt || quote.archivedAt) return record('ignored', match.method, match);
    if (quote.status !== 'sent') return record('already_answered', match.method, match);

    // La fecha «Date» la pone el reloj del cliente (precisión de segundos, puede ir desfasado).
    // Si responde citando nuestro email, su respuesta es necesariamente posterior a ese envío:
    // se acota a [envío citado, ahora] para que un reloj desfasado no la haga «retroactiva».
    const now = new Date();
    let occurredAt = email.date && !Number.isNaN(email.date.getTime()) ? email.date : now;
    if (occurredAt > now) occurredAt = now;
    const floor = match.method === 'message_id' && match.sentAt ? new Date(match.sentAt.getTime() + 1) : quote.sentAt;
    if (floor && occurredAt < floor) occurredAt = floor > now ? now : floor;
    const system = { companyId, userId: null, role: 'owner' } as unknown as AuthContext;
    await changeQuoteStatus(trx, system, quote.id, { status: 'responded', occurredAt, note: null });
    await logActivity(trx, { companyId, userId: null }, {
      action: 'quote.reply_detected',
      entityType: 'quote',
      entityId: quote.id,
      quoteId: quote.id,
      metadata: { method: match.method, provider: input.provider },
    });
    return record('responded', match.method, match);
  });
}
