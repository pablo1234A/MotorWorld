import "server-only";

/**
 * Google Calendar con OAuth 2.0 y la API REST v3 (sin SDK):
 *   https://developers.google.com/identity/protocols/oauth2/web-server
 *   https://developers.google.com/calendar/api/v3/reference/events
 * Ámbitos mínimos: openid + email (saber qué cuenta se conecta) y
 * calendar.events (crear, cambiar y borrar eventos; NO lee el resto de la cuenta).
 * GOOGLE_OAUTH_BASE / GOOGLE_API_BASE solo se usan en pruebas locales.
 */

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];

const authBase = () => process.env.GOOGLE_OAUTH_BASE ?? "https://accounts.google.com";
const tokenBase = () => process.env.GOOGLE_OAUTH_BASE ?? "https://oauth2.googleapis.com";
const apiBase = () => process.env.GOOGLE_API_BASE ?? "https://www.googleapis.com";
const userinfoBase = () => process.env.GOOGLE_API_BASE ?? "https://openidconnect.googleapis.com";

export class GoogleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`google_${status}_${code}`);
    this.name = "GoogleError";
  }
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function authUrl(state: string, redirectUri: string): string {
  const u = new URL("/o/oauth2/v2/auth", authBase());
  u.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return u.toString();
}

export interface Tokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // ms
  scope: string[];
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(new URL("/token", tokenBase()), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!res.ok || !body.access_token) throw new GoogleError(res.status, body.error ?? "token_error");
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    scope: (body.scope ?? "").split(" ").filter(Boolean),
  };
}

export const exchangeCode = (code: string, redirectUri: string) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
export const refreshTokens = (refreshToken: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

export async function accountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(new URL("/v1/userinfo", userinfoBase()), { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const body = (await res.json()) as { email?: string };
  return body.email ?? null;
}

export async function revoke(token: string): Promise<void> {
  await fetch(new URL("/revoke", tokenBase()), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
}

export interface CalendarEvent {
  summary: string;
  description: string;
  location?: string | null;
  start: Date;
  end: Date;
  timeZone: string;
  /** Solicitud con solo un día pedido: evento de día completo (AAAA-MM-DD). */
  allDayDate?: string | null;
  tentative?: boolean;
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function eventBody(id: string, e: CalendarEvent) {
  return {
    id,
    summary: e.summary,
    description: e.description,
    ...(e.location ? { location: e.location } : {}),
    ...(e.allDayDate
      ? { start: { date: e.allDayDate }, end: { date: nextDay(e.allDayDate) } }
      : { start: { dateTime: e.start.toISOString(), timeZone: e.timeZone }, end: { dateTime: e.end.toISOString(), timeZone: e.timeZone } }),
    status: e.tentative ? "tentative" : "confirmed",
    transparency: e.tentative ? "transparent" : "opaque",
    // Sin invitados: el cliente recibe la cita por el correo de RevisaYa (con su .ics).
    reminders: { useDefault: true },
    source: { title: "RevisaYa", url: e.description.match(/https?:\/\/\S+/)?.[0] ?? "https://revisaya.es" },
  };
}

/**
 * Crea o actualiza el evento con un id DETERMINISTA derivado de la cita
 * (base32hex, admitido por Google): repetir la operación nunca duplica eventos.
 */
export async function upsertEvent(accessToken: string, calendarId: string, eventId: string, e: CalendarEvent): Promise<{ id: string; etag: string | null }> {
  const base = `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  let res = await fetch(new URL(`${base}/${eventId}`, apiBase()), { method: "PUT", headers, body: JSON.stringify(eventBody(eventId, e)), signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) {
    res = await fetch(new URL(base, apiBase()), { method: "POST", headers, body: JSON.stringify(eventBody(eventId, e)), signal: AbortSignal.timeout(15_000) });
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string; etag?: string; error?: { status?: string } };
  if (!res.ok || !body.id) throw new GoogleError(res.status, body.error?.status ?? "event_error");
  return { id: body.id, etag: body.etag ?? null };
}

export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const res = await fetch(new URL(`/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, apiBase()), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  // 404/410: ya no existe (borrado en Google): es lo que queríamos.
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new GoogleError(res.status, "delete_error");
}

/** Id de evento a partir del id de la cita: solo [a-v0-9] (base32hex), 5–1024 caracteres. "rv" = RevisaYa (la "y" no es base32hex). */
export function eventIdFor(appointmentId: string): string {
  return `rv${appointmentId.replace(/-/g, "").toLowerCase()}`;
}
