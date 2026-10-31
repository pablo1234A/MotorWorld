import { AuthTokenType, type User } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { randomToken, sha256 } from "../crypto";
import { AppError } from "../http/errors";
import { sendSystemEmail } from "../email/system-mailer";
import { audit } from "../modules/audit";
import { burnPasswordCheck, hashPassword, passwordPolicyError, verifyPassword } from "./password";
import { createSession, destroyAllSessions } from "./session";

export const TERMS_VERSION = "2026-10";
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const VERIFY_TTL_H = 48;
const RESET_TTL_MIN = 60;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

async function issueToken(userId: string, type: AuthTokenType, ttlMs: number) {
  // Invalida tokens previos del mismo tipo (solo el último enlace es válido).
  await prisma.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  const token = randomToken(32);
  await prisma.authToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

async function consumeToken(token: string, type: AuthTokenType) {
  if (!token || token.length > 100) return null;
  const now = new Date();
  // Consumo atómico: solo una petición puede marcar el token como usado.
  const row = await prisma.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt <= now) return null;
  const res = await prisma.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  return res.count === 1 ? row : null;
}

export async function sendVerificationEmail(user: Pick<User, "id" | "email" | "name">) {
  const token = await issueToken(user.id, AuthTokenType.EMAIL_VERIFY, VERIFY_TTL_H * 3600_000);
  const url = `${env().APP_URL}/verificar-email?token=${encodeURIComponent(token)}`;
  await sendSystemEmail({
    to: user.email,
    subject: "Confirma tu correo en Reseñalo",
    heading: `Hola ${user.name.split(" ")[0]}, confirma tu correo`,
    paragraphs: ["Gracias por registrarte en Reseñalo. Para activar tu cuenta, confirma que esta dirección de correo es tuya."],
    action: { label: "Confirmar mi correo", url },
    footnote: `El enlace caduca en ${VERIFY_TTL_H} horas. Si no has creado esta cuenta, ignora este mensaje.`,
  });
}

export async function register(input: { name: string; email: string; password: string; acceptTerms: boolean }, req?: Request) {
  const email = normalizeEmail(input.email);
  if (!input.acceptTerms) throw new AppError("VALIDATION", "Debes aceptar las condiciones y la política de privacidad.");
  const policy = passwordPolicyError(input.password, email);
  if (policy) throw new AppError("VALIDATION", policy, { details: { fields: { password: policy } } });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Mensaje explícito: en registro es aceptable y mejora la UX; el login sigue sin revelar nada.
    throw new AppError("CONFLICT", "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.");
  }
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    },
  });
  await audit({ action: "auth.register", userId: user.id, req });
  await sendVerificationEmail(user);
  const meta = req ? { ip: req.headers.get("x-forwarded-for"), userAgent: req.headers.get("user-agent") } : {};
  const session = await createSession(user.id, meta);
  return { user, ...session };
}

export async function login(input: { email: string; password: string }, req?: Request) {
  const email = normalizeEmail(input.email);
  const generic = new AppError("UNAUTHENTICATED", "Correo o contraseña incorrectos.");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) {
    await burnPasswordCheck(input.password);
    throw generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError("RATE_LIMITED", `Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo en ${mins} min o restablece tu contraseña.`, {
      retryAfter: mins * 60,
    });
  }
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : user.lockedUntil },
    });
    await audit({ action: lock ? "auth.locked" : "auth.login_failed", userId: user.id, req });
    throw generic;
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit({ action: "auth.login", userId: user.id, req });
  const meta = req ? { ip: req.headers.get("x-forwarded-for"), userAgent: req.headers.get("user-agent") } : {};
  const session = await createSession(user.id, meta);
  return { user, ...session };
}

export async function verifyEmail(token: string) {
  const row = await consumeToken(token, AuthTokenType.EMAIL_VERIFY);
  if (!row) throw new AppError("BAD_REQUEST", "El enlace de verificación no es válido o ha caducado.");
  const user = await prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ action: "auth.email_verified", userId: user.id });
  return user;
}

export async function requestPasswordReset(rawEmail: string, req?: Request) {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findUnique({ where: { email } });
  // Respuesta idéntica exista o no la cuenta (evita enumeración).
  if (!user || user.deletedAt) return;
  const token = await issueToken(user.id, AuthTokenType.PASSWORD_RESET, RESET_TTL_MIN * 60_000);
  const url = `${env().APP_URL}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
  await audit({ action: "auth.password_reset_requested", userId: user.id, req });
  await sendSystemEmail({
    to: user.email,
    subject: "Restablece tu contraseña de Reseñalo",
    heading: "Restablecer contraseña",
    paragraphs: ["Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Reseñalo."],
    action: { label: "Crear una nueva contraseña", url },
    footnote: `El enlace caduca en ${RESET_TTL_MIN} minutos y solo puede usarse una vez. Si no lo has solicitado, ignora este correo: tu contraseña no cambiará.`,
  });
}

export async function resetPassword(token: string, newPassword: string, req?: Request) {
  const row = await prisma.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (row) {
    const policy = passwordPolicyError(newPassword, row.user.email);
    if (policy) throw new AppError("VALIDATION", policy, { details: { fields: { password: policy } } });
  }
  const consumed = await consumeToken(token, AuthTokenType.PASSWORD_RESET);
  if (!consumed) throw new AppError("BAD_REQUEST", "El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.");
  await prisma.user.update({
    where: { id: consumed.userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
      // Quien recibe el enlace en su buzón demuestra la titularidad del correo.
      emailVerifiedAt: row?.user.emailVerifiedAt ?? new Date(),
    },
  });
  await destroyAllSessions(consumed.userId);
  await audit({ action: "auth.password_reset", userId: consumed.userId, req });
}

export async function changePassword(userId: string, currentSessionId: string, current: string, next: string, req?: Request) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, current))) throw new AppError("VALIDATION", "La contraseña actual no es correcta.", { details: { fields: { currentPassword: "Incorrecta" } } });
  const policy = passwordPolicyError(next, user.email);
  if (policy) throw new AppError("VALIDATION", policy, { details: { fields: { newPassword: policy } } });
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await destroyAllSessions(userId, currentSessionId);
  await audit({ action: "auth.password_changed", userId, req });
}
