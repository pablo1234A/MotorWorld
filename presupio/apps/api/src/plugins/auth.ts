import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { withTenant, type Db, type TenantContext, type Trx } from '../db/database.js';
import type { MembershipRole } from '../db/types.js';
import { can, type Permission } from '../domain/permissions.js';
import { generateToken, hashToken, TOKEN_PATTERN } from '../lib/crypto.js';
import { errors } from '../lib/errors.js';

export interface AuthContext {
  sessionId: string;
  userId: string;
  companyId: string;
  role: MembershipRole;
  email: string;
  fullName: string;
  emailVerified: boolean;
}

export type AuthMode = 'required' | 'optional' | 'none';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Por defecto 'required': toda ruta es privada salvo que se declare lo contrario. */
    auth?: AuthMode;
    permission?: Permission;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/** Contexto autenticado o error 401. */
export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw errors.unauthenticated();
  return req.auth;
}

export function tenantOf(auth: AuthContext): TenantContext {
  return { companyId: auth.companyId, userId: auth.userId };
}

/** Ejecuta `fn` dentro de la empresa del usuario autenticado (RLS activo). */
export function inTenant<T>(app: FastifyInstance, req: FastifyRequest, fn: (trx: Trx, auth: AuthContext) => Promise<T>) {
  const auth = requireAuth(req);
  return withTenant(app.db, tenantOf(auth), (trx) => fn(trx, auth));
}

export function assertPermission(auth: AuthContext, permission: Permission): void {
  if (!can(auth.role, permission)) throw errors.forbidden();
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

export async function createSession(
  db: Db | Trx,
  input: { userId: string; companyId: string; userAgent?: string | undefined; ttlMs: number },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + input.ttlMs);
  await db
    .insertInto('sessions')
    .values({
      userId: input.userId,
      companyId: input.companyId,
      tokenHash: hashToken(token),
      userAgent: input.userAgent?.slice(0, 256) ?? null,
      expiresAt,
    })
    .execute();
  return { token, expiresAt };
}

export function setSessionCookie(app: FastifyInstance, reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(app.config.cookie.name, token, {
    httpOnly: true,
    secure: app.config.cookie.secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(app: FastifyInstance, reply: FastifyReply) {
  reply.clearCookie(app.config.cookie.name, {
    httpOnly: true,
    secure: app.config.cookie.secure,
    sameSite: 'lax',
    path: '/',
  });
}

async function resolveSession(app: FastifyInstance, token: string): Promise<AuthContext | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const now = new Date();
  const { idleTimeoutMs, touchIntervalMs } = app.config.session;

  const session = await app.db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.userId')
    .select([
      'sessions.id as sessionId',
      'sessions.userId',
      'sessions.companyId',
      'sessions.expiresAt',
      'sessions.lastSeenAt',
      'users.email',
      'users.fullName',
      'users.emailVerifiedAt',
    ])
    .where('sessions.tokenHash', '=', hashToken(token))
    .executeTakeFirst();
  if (!session) return null;

  if (session.expiresAt <= now || session.lastSeenAt.getTime() + idleTimeoutMs <= now.getTime()) {
    await app.db.deleteFrom('sessions').where('id', '=', session.sessionId).execute();
    return null;
  }

  // El rol se lee en cada petición: un cambio de rol o una baja surten efecto inmediato.
  const membership = await withTenant(app.db, { companyId: session.companyId, userId: session.userId }, (trx) =>
    trx
      .selectFrom('memberships')
      .select('role')
      .where('companyId', '=', session.companyId)
      .where('userId', '=', session.userId)
      .executeTakeFirst(),
  );
  if (!membership) return null;

  if (now.getTime() - session.lastSeenAt.getTime() > touchIntervalMs) {
    await app.db.updateTable('sessions').set({ lastSeenAt: now }).where('id', '=', session.sessionId).execute();
  }

  return {
    sessionId: session.sessionId,
    userId: session.userId,
    companyId: session.companyId,
    role: membership.role,
    email: session.email,
    fullName: session.fullName,
    emailVerified: session.emailVerifiedAt !== null,
  };
}

export async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (req, reply) => {
    const mode: AuthMode = req.routeOptions.config?.auth ?? 'required';
    if (mode === 'none') return;

    const token = req.cookies[app.config.cookie.name];
    if (token) {
      req.auth = await resolveSession(app, token);
      if (!req.auth) clearSessionCookie(app, reply);
    }

    if (mode === 'required' && !req.auth) throw errors.unauthenticated();

    const permission = req.routeOptions.config?.permission;
    if (permission && req.auth && !can(req.auth.role, permission)) throw errors.forbidden();
  });
}
