import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

type KeyEntry = { id: string; key: Buffer };

let keyring: KeyEntry[] | null = null;

function keys(): KeyEntry[] {
  if (keyring) return keyring;
  const raw = env().ENCRYPTION_KEYS;
  const entries = raw.split(",").map((part, idx) => {
    const [maybeId, maybeKey] = part.includes(":") ? part.split(":") : [`v${idx + 1}`, part];
    const key = Buffer.from(maybeKey.trim(), "base64");
    if (key.length !== 32) throw new Error(`ENCRYPTION_KEYS: la clave '${maybeId}' debe tener 32 bytes en base64`);
    return { id: maybeId.trim(), key };
  });
  if (!entries.length) throw new Error("ENCRYPTION_KEYS vacío");
  keyring = entries;
  return keyring;
}

/** Cifrado autenticado AES-256-GCM. Formato: keyId.iv.tag.ciphertext (base64url) */
export function encrypt(plain: string): string {
  const { id, key } = keys()[0];
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [id, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [id, ivB64, tagB64, ctB64] = payload.split(".");
  const entry = keys().find((k) => k.id === id);
  if (!entry || !ivB64 || !tagB64 || ctB64 === undefined) throw new Error("Dato cifrado inválido o clave desconocida");
  const decipher = createDecipheriv("aes-256-gcm", entry.key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Solo tests */
export function resetKeyring() {
  keyring = null;
}
