import { Buffer } from 'buffer';
import { sha256 } from '@noble/hashes/sha2.js';
import { scrypt as nobleScrypt } from '@noble/hashes/scrypt.js';

/** node:crypto subset used by the company engine. */
export function randomBytes(n: number) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(n)));
}

export function createHash(_algo: 'sha256') {
  let data = new Uint8Array();
  return {
    update(s: string | Uint8Array) {
      const add = typeof s === 'string' ? new TextEncoder().encode(s) : s;
      const next = new Uint8Array(data.length + add.length);
      next.set(data);
      next.set(add, data.length);
      data = next;
      return this;
    },
    digest(enc: 'hex' | 'base64') {
      return Buffer.from(sha256(data)).toString(enc);
    },
  };
}

export function scrypt(pw: string, salt: Uint8Array, len: number, cb: (err: Error | null, key?: Buffer) => void) {
  try {
    cb(null, Buffer.from(nobleScrypt(pw, salt, { N: 16384, r: 8, p: 1, dkLen: len })));
  } catch (e) {
    cb(e as Error);
  }
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export default { randomBytes, createHash, scrypt, timingSafeEqual };
