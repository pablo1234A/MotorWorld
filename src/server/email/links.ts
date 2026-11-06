import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Enlaces firmados de los correos (baja de avisos). El token identifica al
 * cliente y va firmado con HMAC-SHA-256: no se puede fabricar ni modificar
 * sin el secreto del servidor. No caduca (la baja debe funcionar siempre).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sign(purpose: string, id: string, secret: string): string {
  return createHmac("sha256", secret).update(`${purpose}:${id}`).digest("base64url").slice(0, 32);
}

export function unsubscribeToken(customerId: string, secret: string): string {
  return `${customerId}.${sign("unsubscribe", customerId, secret)}`;
}

/** Devuelve el id del cliente si el token es auténtico. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const [id, sig, extra] = token.split(".");
  if (extra !== undefined || !id || !sig || !UUID.test(id)) return null;
  const expected = Buffer.from(sign("unsubscribe", id, secret));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}
