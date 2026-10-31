import { prisma } from "../db";
import { decrypt, encrypt, hmacSha256, randomToken, safeEqual, sha256 } from "../crypto";
import { AppError, notFound } from "../http/errors";
import { audit } from "./audit";

// ───────────── API keys (Authorization: Bearer rsn_live_…) ─────────────

export async function createApiKey(businessId: string, userId: string, name: string, req?: Request) {
  const count = await prisma.apiKey.count({ where: { businessId, revokedAt: null } });
  if (count >= 10) throw new AppError("CONFLICT", "Máximo 10 claves activas. Revoca alguna antes de crear otra.");
  const secret = `rsn_live_${randomToken(30)}`;
  const key = await prisma.apiKey.create({ data: { businessId, name, prefix: secret.slice(0, 14), keyHash: sha256(secret) } });
  await audit({ action: "api_key.created", userId, businessId, targetId: key.id, req });
  return { key, secret }; // el secreto solo se muestra una vez
}

export const listApiKeys = (businessId: string) =>
  prisma.apiKey.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true } });

export async function revokeApiKey(businessId: string, userId: string, id: string, req?: Request) {
  const res = await prisma.apiKey.updateMany({ where: { id, businessId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!res.count) throw notFound("Clave");
  await audit({ action: "api_key.revoked", userId, businessId, targetId: id, req });
}

export async function authenticateApiKey(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(rsn_live_[A-Za-z0-9_-]{20,})$/);
  if (!m) throw new AppError("UNAUTHENTICATED", "Falta o es inválida la clave de API (Authorization: Bearer rsn_live_…).");
  const key = await prisma.apiKey.findUnique({ where: { keyHash: sha256(m[1]) }, include: { business: true } });
  if (!key || key.revokedAt) throw new AppError("UNAUTHENTICATED", "Clave de API no válida o revocada.");
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000)
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return key.business;
}

// ───────────── Webhook entrante firmado (HMAC-SHA256) ─────────────

export async function getOrCreateInboundWebhook(businessId: string) {
  const existing = await prisma.inboundWebhook.findUnique({ where: { businessId } });
  if (existing) return { ...existing, secret: decrypt(existing.secretEnc) };
  const secret = `whsec_${randomToken(32)}`;
  const w = await prisma.inboundWebhook.create({ data: { businessId, publicId: randomToken(16), secretEnc: encrypt(secret) } });
  return { ...w, secret };
}

export async function rotateInboundWebhookSecret(businessId: string, userId: string, req?: Request) {
  const secret = `whsec_${randomToken(32)}`;
  await getOrCreateInboundWebhook(businessId);
  await prisma.inboundWebhook.update({ where: { businessId }, data: { secretEnc: encrypt(secret) } });
  await audit({ action: "inbound_webhook.secret_rotated", userId, businessId, req });
  return secret;
}

/**
 * Verifica la firma `X-Resenalo-Signature: t=<unix>,v1=<hex>` donde
 * v1 = HMAC_SHA256(secret, `${t}.${rawBody}`). Tolerancia de 5 minutos (anti-replay).
 */
export async function verifyInboundWebhook(publicId: string, rawBody: string, header: string | null) {
  const hook = await prisma.inboundWebhook.findUnique({ where: { publicId }, include: { business: true } });
  if (!hook || !hook.active) throw new AppError("NOT_FOUND", "Webhook no encontrado");
  if (!header) throw new AppError("UNAUTHENTICATED", "Falta la cabecera X-Resenalo-Signature");
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1) throw new AppError("UNAUTHENTICATED", "Firma mal formada");
  if (Math.abs(Date.now() / 1000 - t) > 300) throw new AppError("UNAUTHENTICATED", "Firma caducada");
  const expected = hmacSha256(decrypt(hook.secretEnc), `${t}.${rawBody}`);
  if (!safeEqual(expected, parts.v1)) throw new AppError("UNAUTHENTICATED", "Firma no válida");
  return hook.business;
}

export function signInboundPayload(secret: string, rawBody: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${hmacSha256(secret, `${t}.${rawBody}`)}`;
}
