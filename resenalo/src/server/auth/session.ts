import type { Session, User } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { randomToken, sha256 } from "../crypto";
import { SESSION_COOKIE, parseCookies, serializeCookie } from "./cookies";

export type AuthContext = { user: User; session: Session };

const secureCookies = () => env().APP_URL.startsWith("https://");

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomToken(32);
  const ttlMs = env().SESSION_TTL_DAYS * 86400_000;
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + ttlMs),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, session, cookie: sessionCookie(token) };
}

export function sessionCookie(token: string) {
  return serializeCookie(SESSION_COOKIE, token, { maxAge: env().SESSION_TTL_DAYS * 86400, secure: secureCookies() });
}

export function clearSessionCookie() {
  return serializeCookie(SESSION_COOKIE, "", { maxAge: 0, secure: secureCookies() });
}

/** Valida el token de sesión contra la BD. Renueva la caducidad de forma deslizante. */
export async function validateSessionToken(token: string | undefined | null): Promise<AuthContext | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || session.user.deletedAt) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  // Sesiones creadas antes de un cambio de contraseña quedan invalidadas.
  if (session.user.passwordChangedAt && session.createdAt < session.user.passwordChangedAt) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const ttlMs = env().SESSION_TTL_DAYS * 86400_000;
  if (now - session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(now + ttlMs) } })
      .catch(() => undefined);
  }
  const { user, ...rest } = session;
  return { user, session: rest as Session };
}

export async function getAuthFromRequest(req: Request): Promise<AuthContext | null> {
  const token = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  return validateSessionToken(token);
}

export async function destroySession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function destroyAllSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}
