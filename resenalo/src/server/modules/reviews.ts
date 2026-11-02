/* eslint-disable @typescript-eslint/no-explicit-any -- respuestas JSON de las APIs de Google con forma variable */
import { createHash } from "node:crypto";
import { ConnectionStatus } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { decrypt, encrypt, randomToken, sha256 } from "../crypto";
import { AppError } from "../http/errors";
import { logger } from "../logger";
import { fetchWithTimeout, ProviderError, readError, retryAfter } from "../email/providers/types";
import { audit } from "./audit";

/**
 * Integración con Google Business Profile: lee las reseñas reales de la ficha
 * del negocio (valoración, comentario, respuesta) y permite responderlas.
 * Requiere que Google apruebe el acceso del proyecto a las APIs de Business Profile.
 */
export const GBP_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/business.manage"];
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
export const reviewsRedirectUri = () => `${env().APP_URL}/api/v1/reviews/callback`;

function configured() {
  return Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET);
}

async function token(params: Record<string, string>) {
  const res = await fetchWithTimeout(env().GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env().GOOGLE_CLIENT_ID!, client_secret: env().GOOGLE_CLIENT_SECRET!, ...params }).toString(),
  });
  if (!res.ok) {
    const { json } = await readError(res);
    if (json?.error === "invalid_grant" || res.status === 401) throw new ProviderError("auth", "Google rechazó la autorización de Business Profile.", res.status);
    throw new ProviderError(res.status >= 500 ? "transient" : "permanent", `Error OAuth de Google (${json?.error ?? res.status}).`, res.status);
  }
  return res.json() as Promise<any>;
}

async function gapi(accessToken: string, url: string, init: RequestInit = {}) {
  const res = await fetchWithTimeout(url, { ...init, headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  if (res.ok) return res.status === 204 ? {} : res.json();
  const { json, text } = await readError(res);
  const msg = json?.error?.message ?? text;
  if (res.status === 401) throw new ProviderError("auth", "La autorización de Google Business Profile ha caducado o se ha revocado.", 401);
  if (res.status === 403) throw new ProviderError("permanent", `Google denegó el acceso a Business Profile: ${msg}`, 403);
  if (res.status === 429) throw new ProviderError("rate_limit", "Límite de la API de Google Business Profile alcanzado.", 429, retryAfter(res));
  if (res.status >= 500) throw new ProviderError("transient", `Google Business Profile no disponible (${res.status}).`, res.status);
  throw new ProviderError("permanent", `Error de Google Business Profile: ${msg}`, res.status);
}

export async function startReviewsOAuth(businessId: string, userId: string) {
  if (!configured()) throw new AppError("NOT_CONFIGURED", "La conexión con Google no está configurada en el servidor (GOOGLE_CLIENT_ID/SECRET).");
  const state = randomToken(24);
  const verifier = randomToken(48);
  await prisma.oAuthState.create({
    data: { stateHash: sha256(state), businessId, userId, provider: "GOOGLE", purpose: "reviews", codeVerifierEnc: encrypt(verifier), expiresAt: new Date(Date.now() + 10 * 60_000) },
  });
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID!,
    redirect_uri: reviewsRedirectUri(),
    response_type: "code",
    scope: GBP_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

export async function completeReviewsOAuth(p: { state: string; code: string; userId: string }, req?: Request) {
  const row = await prisma.oAuthState.findUnique({ where: { stateHash: sha256(p.state) } });
  if (row) await prisma.oAuthState.delete({ where: { id: row.id } }).catch(() => undefined);
  if (!row || row.expiresAt < new Date() || row.purpose !== "reviews" || row.userId !== p.userId)
    throw new AppError("BAD_REQUEST", "La solicitud de conexión ha caducado o no es válida. Vuelve a intentarlo.");
  const t = await token({ code: p.code, code_verifier: decrypt(row.codeVerifierEnc), redirect_uri: reviewsRedirectUri(), grant_type: "authorization_code" });
  if (!String(t.scope ?? "").includes("business.manage")) throw new AppError("BAD_REQUEST", "No se concedió el permiso para gestionar tu ficha de Google.");
  if (!t.refresh_token) throw new AppError("BAD_REQUEST", "Google no devolvió un token de actualización. Vuelve a conectar.");
  const info = await gapi(t.access_token, env().GOOGLE_USERINFO_URL);
  const data = {
    googleEmail: String(info.email ?? "").toLowerCase(),
    accessTokenEnc: encrypt(t.access_token),
    refreshTokenEnc: encrypt(t.refresh_token),
    tokenExpiresAt: new Date(Date.now() + (Number(t.expires_in ?? 3600) - 30) * 1000),
    scopes: String(t.scope),
    status: ConnectionStatus.ACTIVE,
    lastError: null,
    connectedAt: new Date(),
  };
  const source = await prisma.reviewSource.upsert({ where: { businessId: row.businessId }, create: { businessId: row.businessId, ...data }, update: data });
  await audit({ action: "reviews.connected", userId: p.userId, businessId: row.businessId, req });
  // Si solo hay una ficha, se selecciona automáticamente.
  try {
    const locations = await listLocations(row.businessId);
    if (locations.length === 1) await selectLocation(row.businessId, locations[0]);
  } catch (err) {
    logger.warn({ err }, "no se pudieron listar las fichas de Google tras conectar");
  }
  return source;
}

async function accessToken(businessId: string) {
  const s = await prisma.reviewSource.findUnique({ where: { businessId } });
  if (!s || s.status === ConnectionStatus.DISCONNECTED || !s.refreshTokenEnc) throw new AppError("NOT_FOUND", "No has conectado tu ficha de Google.");
  if (s.accessTokenEnc && s.tokenExpiresAt && s.tokenExpiresAt.getTime() > Date.now() + 60_000) return { s, token: decrypt(s.accessTokenEnc) };
  try {
    const t = await token({ refresh_token: decrypt(s.refreshTokenEnc), grant_type: "refresh_token" });
    await prisma.reviewSource.update({
      where: { id: s.id },
      data: { accessTokenEnc: encrypt(t.access_token), tokenExpiresAt: new Date(Date.now() + (Number(t.expires_in ?? 3600) - 30) * 1000), status: ConnectionStatus.ACTIVE },
    });
    return { s, token: t.access_token as string };
  } catch (err) {
    if (err instanceof ProviderError && err.kind === "auth")
      await prisma.reviewSource.update({ where: { id: s.id }, data: { status: ConnectionStatus.NEEDS_REAUTH, lastError: err.message } });
    throw err;
  }
}

export type GbpLocation = { account: string; location: string; title: string };

export async function listLocations(businessId: string): Promise<GbpLocation[]> {
  const { token: t } = await accessToken(businessId);
  const acc = await gapi(t, `${env().GOOGLE_ACCOUNT_MGMT_API_URL}/v1/accounts`);
  const out: GbpLocation[] = [];
  for (const a of acc.accounts ?? []) {
    const loc = await gapi(t, `${env().GOOGLE_BUSINESS_INFO_API_URL}/v1/${a.name}/locations?readMask=name,title&pageSize=100`);
    for (const l of loc.locations ?? []) out.push({ account: a.name, location: l.name, title: l.title ?? l.name });
  }
  return out;
}

export async function selectLocation(businessId: string, loc: GbpLocation) {
  if (!/^accounts\/[\w-]+$/.test(loc.account) || !/^locations\/[\w-]+$/.test(loc.location)) throw new AppError("VALIDATION", "Ficha no válida");
  await prisma.reviewSource.update({ where: { businessId }, data: { accountName: loc.account, locationName: loc.location, locationTitle: loc.title.slice(0, 200) } });
  await syncReviews(businessId).catch((err) => logger.warn({ err }, "primera sincronización de reseñas fallida"));
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Coincidencia de nombre para la atribución estimada: nombre completo, o nombre + inicial del apellido («Laura M.»). */
export function namesMatch(reviewer: string, customer: string) {
  const r = norm(reviewer).split(" ");
  const c = norm(customer).split(" ");
  if (!r[0] || !c[0] || r[0] !== c[0]) return false;
  if (r.length === 1) return false; // solo el nombre es demasiado ambiguo
  if (norm(reviewer) === norm(customer)) return true;
  return Boolean(c[1] && r[1] && c[1][0] === r[1][0] && (r[1].length === 1 || c[1].startsWith(r[1])));
}

/** Descarga las reseñas de la ficha (hasta 1 año o 10 páginas), las guarda y estima su atribución. */
export async function syncReviews(businessId: string) {
  const { s, token: t } = await accessToken(businessId);
  if (!s.accountName || !s.locationName) return { synced: 0 };
  let pageToken: string | undefined;
  let synced = 0;
  const since = Date.now() - 400 * 86400_000;
  try {
    for (let page = 0; page < 10; page++) {
      const url = `${env().GOOGLE_BUSINESS_API_URL}/v4/${s.accountName}/${s.locationName}/reviews?pageSize=50&orderBy=${encodeURIComponent("updateTime desc")}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const j = await gapi(t, url);
      if (page === 0)
        await prisma.reviewSource.update({ where: { id: s.id }, data: { averageRating: j.averageRating ?? null, totalReviewCount: j.totalReviewCount ?? null } });
      let older = false;
      for (const r of j.reviews ?? []) {
        const createTime = new Date(r.createTime);
        if (createTime.getTime() < since) older = true;
        const data = {
          reviewerName: String(r.reviewer?.isAnonymous ? "Anónimo" : (r.reviewer?.displayName ?? "Anónimo")).slice(0, 120),
          starRating: STARS[r.starRating] ?? 0,
          comment: r.comment ? String(r.comment).slice(0, 5000) : null,
          createTime,
          updateTime: new Date(r.updateTime ?? r.createTime),
          replyComment: r.reviewReply?.comment ?? null,
          replyTime: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null,
        };
        await prisma.review.upsert({ where: { externalId: r.name }, create: { externalId: r.name, businessId, sourceId: s.id, ...data }, update: data });
        synced++;
      }
      pageToken = j.nextPageToken;
      if (!pageToken || older) break;
    }
    await attributeReviews(businessId);
    await prisma.reviewSource.update({ where: { id: s.id }, data: { lastSyncAt: new Date(), lastError: null } });
    return { synced };
  } catch (err) {
    await prisma.reviewSource.update({ where: { id: s.id }, data: { lastError: (err as Error).message.slice(0, 500) } });
    throw err;
  }
}

/** Atribución ESTIMADA: reseña de alguien con el mismo nombre que recibió una solicitud en los 30 días previos. */
export async function attributeReviews(businessId: string) {
  // Solo reseñas recientes: para las antiguas ya existían todas las solicitudes posibles y se evaluaron.
  const pending = await prisma.review.findMany({
    where: { businessId, attributedJobId: null, reviewerName: { not: "Anónimo" }, createTime: { gte: new Date(Date.now() - 45 * 86400_000) } },
    take: 500,
  });
  for (const r of pending) {
    const jobs = await prisma.emailJob.findMany({
      where: { businessId, status: { in: ["SENT", "DELIVERED"] }, sentAt: { gte: new Date(r.createTime.getTime() - 30 * 86400_000), lte: r.createTime } },
      select: { id: true, toName: true },
      orderBy: { sentAt: "desc" },
      take: 500,
    });
    const match = jobs.filter((j) => namesMatch(r.reviewerName, j.toName));
    if (match.length === 1) await prisma.review.update({ where: { id: r.id }, data: { attributedJobId: match[0].id } });
  }
}

export async function replyToReview(businessId: string, userId: string, reviewId: string, comment: string, req?: Request) {
  const r = await prisma.review.findFirst({ where: { id: reviewId, businessId } });
  if (!r) throw new AppError("NOT_FOUND", "Reseña no encontrada");
  const { token: t } = await accessToken(businessId);
  const res = await gapi(t, `${env().GOOGLE_BUSINESS_API_URL}/v4/${r.externalId}/reply`, { method: "PUT", body: JSON.stringify({ comment }) });
  const updated = await prisma.review.update({ where: { id: r.id }, data: { replyComment: comment, replyTime: res.updateTime ? new Date(res.updateTime) : new Date() } });
  await audit({ action: "reviews.replied", userId, businessId, targetId: r.id, req });
  return updated;
}

export async function disconnectReviews(businessId: string, userId: string, req?: Request) {
  const s = await prisma.reviewSource.findUnique({ where: { businessId } });
  if (!s) throw new AppError("NOT_FOUND", "No hay ninguna ficha conectada.");
  if (s.refreshTokenEnc)
    await fetchWithTimeout(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(s.refreshTokenEnc))}`, { method: "POST" }).catch(() => undefined);
  await prisma.reviewSource.update({ where: { id: s.id }, data: { status: ConnectionStatus.DISCONNECTED, accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null } });
  await audit({ action: "reviews.disconnected", userId, businessId, req });
}

/** Resumen real de reseñas para el panel y las estadísticas. */
export async function reviewSummary(businessId: string, sinceDays = 30) {
  const s = await prisma.reviewSource.findUnique({ where: { businessId } });
  if (!s || s.status === ConnectionStatus.DISCONNECTED) return null;
  const since = new Date(Date.now() - sinceDays * 86400_000);
  const [recent, attributed] = await Promise.all([
    prisma.review.findMany({ where: { businessId, createTime: { gte: since } }, select: { starRating: true } }),
    prisma.review.count({ where: { businessId, createTime: { gte: since }, attributedJobId: { not: null } } }),
  ]);
  return {
    status: s.status,
    locationTitle: s.locationTitle,
    needsLocation: !s.locationName,
    lastSyncAt: s.lastSyncAt,
    lastError: s.lastError,
    averageRating: s.averageRating,
    totalReviewCount: s.totalReviewCount,
    recentCount: recent.length,
    recentAverage: recent.length ? Math.round((recent.reduce((a, r) => a + r.starRating, 0) / recent.length) * 10) / 10 : null,
    attributedRecent: attributed,
    days: sinceDays,
  };
}

/** Sincronización periódica (worker). */
export async function syncAllReviewSources() {
  const sources = await prisma.reviewSource.findMany({ where: { status: ConnectionStatus.ACTIVE, locationName: { not: null } }, select: { businessId: true } });
  let ok = 0;
  for (const s of sources) {
    try {
      await syncReviews(s.businessId);
      ok++;
    } catch (err) {
      logger.warn({ err, businessId: s.businessId }, "sincronización de reseñas fallida");
    }
  }
  return { sources: sources.length, ok };
}
