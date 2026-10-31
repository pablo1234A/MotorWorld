import { createHash } from "node:crypto";
import { ConnectionStatus, EmailJobStatus, EmailLogEvent, type EmailConnection, type EmailProvider } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { decrypt, encrypt, randomToken, sha256 } from "../crypto";
import { AppError } from "../http/errors";
import { logger } from "../logger";
import { getProvider } from "../email/providers";
import { ProviderError } from "../email/providers/types";
import { sendSystemEmail } from "../email/system-mailer";
import { audit } from "./audit";
import { enqueueEmailJob } from "../queue/queues";

const STATE_TTL_MS = 10 * 60_000;
export const ON_HOLD_RESUME_MAX_AGE_MS = 7 * 86400_000;

export const redirectUri = (provider: EmailProvider) =>
  `${env().APP_URL}/api/v1/email-connection/callback/${provider === "GOOGLE" ? "google" : "microsoft"}`;

export function publicConnection(c: EmailConnection | null) {
  if (!c) return null;
  return {
    id: c.id,
    provider: c.provider,
    emailAddress: c.emailAddress,
    displayName: c.displayName,
    status: c.status,
    lastCheckedAt: c.lastCheckedAt,
    lastError: c.lastError,
    lastErrorAt: c.lastErrorAt,
    connectedAt: c.connectedAt,
  };
}

export const OAUTH_RETURN = { onboarding: "/onboarding", app: "/app/conexion-correo" } as const;

export async function startOAuth(p: { businessId: string; userId: string; provider: EmailProvider; loginHint?: string; returnTo?: keyof typeof OAUTH_RETURN }) {
  const provider = getProvider(p.provider);
  if (!provider.isConfigured())
    throw new AppError("NOT_CONFIGURED", `La conexión con ${provider.label} no está configurada en el servidor (faltan credenciales OAuth).`);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await prisma.oAuthState.create({
    data: {
      stateHash: sha256(state),
      businessId: p.businessId,
      userId: p.userId,
      provider: p.provider,
      codeVerifierEnc: encrypt(verifier),
      returnTo: OAUTH_RETURN[p.returnTo ?? "app"],
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });
  return provider.authorizeUrl({ state, codeChallenge: challenge, redirectUri: redirectUri(p.provider), loginHint: p.loginHint });
}

/**
 * Completa el flujo OAuth. Solo marca la cuenta como conectada cuando el
 * proveedor ha emitido tokens válidos con el permiso de envío.
 */
export async function completeOAuth(p: { provider: EmailProvider; state: string; code: string; userId: string }, req?: Request) {
  const row = await prisma.oAuthState.findUnique({ where: { stateHash: sha256(p.state) } });
  if (row) await prisma.oAuthState.delete({ where: { id: row.id } }).catch(() => undefined); // un solo uso
  if (!row || row.expiresAt < new Date() || row.provider !== p.provider || row.userId !== p.userId)
    throw new AppError("BAD_REQUEST", "La solicitud de conexión ha caducado o no es válida. Vuelve a intentarlo.");

  const provider = getProvider(p.provider);
  const identity = await provider.exchangeCode({ code: p.code, codeVerifier: decrypt(row.codeVerifierEnc), redirectUri: redirectUri(p.provider) });

  const data = {
    provider: p.provider,
    emailAddress: identity.email,
    displayName: identity.displayName ?? null,
    accessTokenEnc: encrypt(identity.accessToken),
    refreshTokenEnc: identity.refreshToken ? encrypt(identity.refreshToken) : null,
    tokenExpiresAt: identity.expiresAt,
    scopes: identity.scope,
    status: ConnectionStatus.ACTIVE,
    lastCheckedAt: new Date(),
    lastError: null,
    lastErrorAt: null,
    authFailureCount: 0,
    connectedAt: new Date(),
  };
  const connection = await prisma.emailConnection.upsert({
    where: { businessId: row.businessId },
    create: { businessId: row.businessId, ...data },
    update: data,
  });
  await audit({ action: "email_connection.connected", userId: p.userId, businessId: row.businessId, targetId: connection.id, meta: { provider: p.provider, email: identity.email }, req });
  await resumeOnHoldJobs(row.businessId, connection.id);
  return { connection, returnTo: row.returnTo ?? OAUTH_RETURN.app };
}

/** Reanuda los envíos retenidos por falta de autorización (solo los recientes). */
export async function resumeOnHoldJobs(businessId: string, connectionId: string) {
  const held = await prisma.emailJob.findMany({ where: { businessId, status: EmailJobStatus.ON_HOLD } });
  const cutoff = Date.now() - ON_HOLD_RESUME_MAX_AGE_MS;
  for (const job of held) {
    if (job.createdAt.getTime() < cutoff) {
      await prisma.emailJob.update({
        where: { id: job.id },
        data: { status: EmailJobStatus.CANCELED, statusReason: "EXPIRED_ON_HOLD" },
      });
      await prisma.emailLog.create({ data: { emailJobId: job.id, businessId, event: EmailLogEvent.CANCELED, message: "Cancelado: llevaba más de 7 días en espera de autorización." } });
      continue;
    }
    const upd = await prisma.emailJob.updateMany({
      where: { id: job.id, status: EmailJobStatus.ON_HOLD },
      data: { status: EmailJobStatus.QUEUED, connectionId, statusReason: null, scheduledFor: new Date() },
    });
    if (upd.count) {
      await prisma.emailLog.create({ data: { emailJobId: job.id, businessId, event: EmailLogEvent.REQUEUED, message: "Reanudado tras reconectar el correo." } });
      await enqueueEmailJob(job.id);
    }
  }
}

/** Devuelve un access token válido, renovándolo si es necesario. */
export async function getAccessToken(connection: EmailConnection): Promise<string> {
  if (connection.status !== ConnectionStatus.ACTIVE) throw new ProviderError("auth", "La conexión de correo no está activa.");
  if (connection.accessTokenEnc && connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return decrypt(connection.accessTokenEnc);
  }
  if (!connection.refreshTokenEnc) throw new ProviderError("auth", "No hay token de actualización. Reconecta la cuenta.");
  const provider = getProvider(connection.provider);
  const t = await provider.refresh(decrypt(connection.refreshTokenEnc));
  await prisma.emailConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encrypt(t.accessToken),
      ...(t.refreshToken ? { refreshTokenEnc: encrypt(t.refreshToken) } : {}),
      tokenExpiresAt: t.expiresAt,
      lastCheckedAt: new Date(),
      authFailureCount: 0,
    },
  });
  return t.accessToken;
}

/**
 * Marca la conexión como sin autorización, registra el fallo y avisa al
 * propietario (solo en la transición ACTIVE → NEEDS_REAUTH, para no saturar).
 */
export async function markAuthFailure(connectionId: string, reason: string) {
  const before = await prisma.emailConnection.findUnique({ where: { id: connectionId }, include: { business: { include: { owner: true } } } });
  if (!before) return;
  await prisma.emailConnection.update({
    where: { id: connectionId },
    data: { status: ConnectionStatus.NEEDS_REAUTH, lastError: reason.slice(0, 500), lastErrorAt: new Date(), authFailureCount: { increment: 1 } },
  });
  await audit({ action: "email_connection.auth_failed", businessId: before.businessId, targetId: connectionId, meta: { reason: reason.slice(0, 300) } });
  if (before.status === ConnectionStatus.ACTIVE) {
    try {
      await sendSystemEmail({
        to: before.business.owner.email,
        subject: "Acción necesaria: vuelve a conectar tu correo en Reseñalo",
        heading: "Hemos perdido la autorización de tu correo",
        paragraphs: [
          `La cuenta ${before.emailAddress} ya no permite a Reseñalo enviar solicitudes de reseña (${reason.slice(0, 160)}).`,
          "Los envíos pendientes quedan en espera y se reanudarán automáticamente cuando vuelvas a conectar la cuenta.",
        ],
        action: { label: "Reconectar mi correo", url: `${env().APP_URL}/app/conexion-correo` },
      });
    } catch (err) {
      logger.warn({ err }, "no se pudo enviar aviso de reautorización");
    }
  }
}

export async function disconnect(businessId: string, userId: string, req?: Request) {
  const c = await prisma.emailConnection.findUnique({ where: { businessId } });
  if (!c) throw new AppError("NOT_FOUND", "No hay ninguna cuenta de correo conectada.");
  try {
    const token = c.refreshTokenEnc ? decrypt(c.refreshTokenEnc) : c.accessTokenEnc ? decrypt(c.accessTokenEnc) : null;
    if (token) await getProvider(c.provider).revoke(token);
  } catch (err) {
    logger.warn({ err }, "revocación OAuth fallida (se eliminan los tokens igualmente)");
  }
  await prisma.emailConnection.update({
    where: { id: c.id },
    data: { status: ConnectionStatus.DISCONNECTED, accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null },
  });
  // Los envíos pendientes se retienen hasta que haya una nueva conexión.
  await prisma.emailJob.updateMany({
    where: { businessId, status: { in: [EmailJobStatus.QUEUED, EmailJobStatus.SCHEDULED] } },
    data: { status: EmailJobStatus.ON_HOLD, statusReason: "EMAIL_DISCONNECTED" },
  });
  await audit({ action: "email_connection.disconnected", userId, businessId, targetId: c.id, req });
}

/** Comprueba la autorización real con el proveedor (renovando el token). */
export async function checkConnection(businessId: string) {
  const c = await prisma.emailConnection.findUnique({ where: { businessId } });
  if (!c || c.status === ConnectionStatus.DISCONNECTED) throw new AppError("NOT_FOUND", "No hay ninguna cuenta de correo conectada.");
  if (c.status === ConnectionStatus.NEEDS_REAUTH) return { ok: false, status: c.status, error: c.lastError };
  try {
    // Forzamos renovación para verificar con el proveedor que el permiso sigue vigente.
    await getAccessToken({ ...c, tokenExpiresAt: new Date(0) });
    return { ok: true, status: ConnectionStatus.ACTIVE, error: null };
  } catch (err) {
    if (err instanceof ProviderError && err.kind === "auth") {
      await markAuthFailure(c.id, err.message);
      return { ok: false, status: ConnectionStatus.NEEDS_REAUTH, error: err.message };
    }
    await prisma.emailConnection.update({ where: { id: c.id }, data: { lastError: (err as Error).message.slice(0, 500), lastErrorAt: new Date() } });
    return { ok: false, status: c.status, error: (err as Error).message };
  }
}

/**
 * Envía un correo de prueba REAL con la cuenta conectada a una dirección del
 * propio usuario (no a clientes). No consume cupo del plan. Usa la plantilla
 * por defecto con datos de ejemplo para comprobar el resultado final.
 */
export async function sendTestEmail(p: { businessId: string; userId: string; to: string; templateId?: string }, req?: Request) {
  const { renderTemplate } = await import("@/lib/template");
  const { buildMime } = await import("../email/mime");
  const { footerLinesFor } = await import("./automation/requests");
  const business = await prisma.business.findUniqueOrThrow({ where: { id: p.businessId } });
  const c = await prisma.emailConnection.findUnique({ where: { businessId: p.businessId } });
  if (!c || c.status === ConnectionStatus.DISCONNECTED) throw new AppError("CONFLICT", "Conecta primero una cuenta de correo.");
  if (c.status === ConnectionStatus.NEEDS_REAUTH) throw new AppError("CONFLICT", "La cuenta necesita volver a autorizarse antes de enviar.");
  const template = p.templateId
    ? await prisma.emailTemplate.findFirst({ where: { id: p.templateId, businessId: p.businessId } })
    : await prisma.emailTemplate.findFirst({ where: { businessId: p.businessId, isDefault: true } });
  if (!template) throw new AppError("NOT_FOUND", "Plantilla no encontrada");
  const rendered = renderTemplate(template, {
    customerName: "Cliente de prueba",
    businessName: business.name,
    serviceName: "servicio de prueba",
    reviewUrl: business.reviewUrl ?? `${env().APP_URL}/`,
    unsubscribeUrl: `${env().APP_URL}/baja/prueba`,
    footerLines: footerLinesFor(business),
  });
  const mime = await buildMime({
    from: { name: business.senderName || business.name, address: c.emailAddress },
    to: { name: "Prueba", address: p.to },
    replyTo: business.replyToEmail,
    subject: `[Prueba] ${rendered.subject}`,
    text: rendered.text,
    html: rendered.html,
    messageId: `<test.${randomToken(8)}@${new URL(env().APP_URL).hostname}>`,
    headers: { "X-Resenalo-Test": "1" },
  });
  try {
    const token = await getAccessToken(c);
    const res = await getProvider(c.provider).send(token, mime);
    await prisma.emailConnection.update({ where: { id: c.id }, data: { lastCheckedAt: new Date(), lastError: null } });
    await audit({ action: "email_connection.test_sent", userId: p.userId, businessId: p.businessId, meta: { to: p.to, providerMessageId: res.providerMessageId }, req });
    return { ok: true, providerMessageId: res.providerMessageId };
  } catch (err) {
    if (err instanceof ProviderError && err.kind === "auth") await markAuthFailure(c.id, err.message);
    await audit({ action: "email_connection.test_failed", userId: p.userId, businessId: p.businessId, meta: { error: (err as Error).message.slice(0, 300) }, req });
    if (err instanceof ProviderError) throw new AppError("PROVIDER_ERROR", err.message);
    throw err;
  }
}
