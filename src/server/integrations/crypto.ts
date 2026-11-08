import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado de secretos de integraciones (tokens OAuth) con AES-256-GCM. La clave
 * (INTEGRATIONS_ENCRYPTION_KEY, 32 bytes en base64) vive solo en el entorno
 * del servidor; la base de datos guarda texto cifrado, nonce y etiqueta.
 */
export const KEY_VERSION = 1;

function key(): Buffer {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32) throw new Error("integrations_key_missing");
  return k;
}

export function integrationsKeyConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export interface Sealed {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

export function seal(plain: string, aad: string): Sealed {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { ciphertext, nonce, authTag: cipher.getAuthTag(), keyVersion: KEY_VERSION };
}

/** `aad` ata el secreto a su integración: no se puede copiar el cifrado a otra fila. */
export function open(s: Sealed, aad: string): string {
  const decipher = createDecipheriv("aes-256-gcm", key(), s.nonce);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(s.authTag);
  return Buffer.concat([decipher.update(s.ciphertext), decipher.final()]).toString("utf8");
}
