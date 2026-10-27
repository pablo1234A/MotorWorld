import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Database } from '../db.js';
import { AppError, ValidationError } from '../core/errors.js';
import { newId, now } from '../core/ids.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const SESSION_DAYS = 14;

export const SetupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(10, 'La contraseña debe tener al menos 10 caracteres').max(200),
});
export const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export interface Owner {
  id: string;
  email: string;
  name: string;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, saltHex, keyHex] = stored.split('$');
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * AUTHENTICATION — single owner account (the company has one owner).
 * Passwords: scrypt. Sessions: random 256-bit tokens, stored hashed, HttpOnly cookie.
 */
export class AuthService {
  private attempts = new Map<string, { n: number; until: number }>();

  constructor(private db: Database) {}

  hasOwner(): boolean {
    return Boolean(this.db.get('SELECT id FROM owners LIMIT 1'));
  }

  async setup(input: unknown): Promise<Owner> {
    if (this.hasOwner()) throw new AppError('Owner already configured', 'FORBIDDEN', 403);
    const data = SetupSchema.parse(input);
    const owner = { id: newId('own'), email: data.email, name: data.name };
    this.db.insert('owners', { ...owner, password_hash: await hashPassword(data.password), created_at: now() });
    return owner;
  }

  async login(input: unknown, ip: string): Promise<{ owner: Owner; token: string; expiresAt: string }> {
    const lock = this.attempts.get(ip);
    if (lock && lock.n >= 8 && Date.now() < lock.until) throw new AppError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);
    const data = LoginSchema.parse(input);
    const row = this.db.get<{ id: string; email: string; name: string; password_hash: string }>('SELECT * FROM owners WHERE email = ?', data.email);
    const ok = row ? await verifyPassword(data.password, row.password_hash) : false;
    if (!row || !ok) {
      const cur = this.attempts.get(ip);
      this.attempts.set(ip, { n: (cur && Date.now() < cur.until ? cur.n : 0) + 1, until: Date.now() + 15 * 60_000 });
      throw new AppError('Invalid credentials', 'UNAUTHORIZED', 401);
    }
    this.attempts.delete(ip);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
    this.db.insert('sessions', { token_hash: sha256(token), owner_id: row.id, expires_at: expiresAt, created_at: now() });
    return { owner: { id: row.id, email: row.email, name: row.name }, token, expiresAt };
  }

  verify(token: string | undefined): Owner | null {
    if (!token) return null;
    const row = this.db.get<{ id: string; email: string; name: string; expires_at: string }>(
      'SELECT o.id, o.email, o.name, s.expires_at FROM sessions s JOIN owners o ON o.id = s.owner_id WHERE s.token_hash = ?',
      sha256(token),
    );
    if (!row) return null;
    if (row.expires_at < now()) {
      this.db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
      return null;
    }
    return { id: row.id, email: row.email, name: row.name };
  }

  logout(token: string | undefined) {
    if (token) this.db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  }

  async changePassword(ownerId: string, current: string, next: string) {
    const row = this.db.get<{ password_hash: string }>('SELECT password_hash FROM owners WHERE id = ?', ownerId);
    if (!row || !(await verifyPassword(current, row.password_hash))) throw new AppError('Invalid credentials', 'UNAUTHORIZED', 401);
    if (next.length < 10) throw new ValidationError('La contraseña debe tener al menos 10 caracteres');
    this.db.run('UPDATE owners SET password_hash = ? WHERE id = ?', await hashPassword(next), ownerId);
    this.db.run('DELETE FROM sessions WHERE owner_id = ?', ownerId);
  }
}
