import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Tokens de un solo uso (invitaciones, enlaces de cita…): 256 bits aleatorios
 * en base64url. En la base de datos solo se guarda su SHA-256.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

/** Formato de los tokens generados por `generateToken` (43 caracteres base64url). */
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Hash no reversible para usar datos personales como clave (rate limiting). */
export function fingerprint(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("base64url").slice(0, 22);
}
