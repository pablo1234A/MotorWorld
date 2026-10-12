// Firmas HMAC, cifrado de tokens en reposo y limitación de peticiones.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function loadSecret() {
  if (process.env.SECRET_KEY) return process.env.SECRET_KEY;
  // Sin SECRET_KEY generamos uno y lo guardamos junto a los datos para que sobreviva reinicios.
  const dir = process.env.DATA_DIR || path.resolve('data');
  const file = path.join(dir, '.secret');
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}

const SECRET = loadSecret();
const ENC_KEY = crypto.createHash('sha256').update(`enc:${SECRET}`).digest();

export function sign(value) {
  const mac = crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
  return `${value}.${mac}`;
}

export function unsign(signed) {
  if (typeof signed !== 'string') return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signed);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return value;
}

export function encrypt(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(blob) {
  if (!blob) return null;
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// Ventana deslizante en memoria: protege el endpoint público del chat frente a abusos.
const hits = new Map();
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of hits) if (!arr.some((t) => now - t < 3_600_000)) hits.delete(k);
}, 600_000).unref();
