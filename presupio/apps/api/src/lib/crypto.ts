import { createHash, randomBytes } from 'node:crypto';

/** Token aleatorio de 256 bits, apto para URL. Se entrega al usuario; nunca se guarda tal cual. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash que se guarda en la base de datos. Un token de 256 bits no necesita sal ni hash lento. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Formato esperado de un token emitido por generateToken(). */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
