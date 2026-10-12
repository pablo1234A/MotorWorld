// Integración con Google: OAuth 2.0, Google Calendar (disponibilidad y eventos) y Gmail (avisos).
// Si un bot no tiene Google conectado funciona en "modo demo" con un calendario local,
// para que puedas probar todo el flujo de reservas sin credenciales.
import { encrypt, decrypt } from './security.js';
import { listBookings, saveBot } from './db.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const CAL = 'https://www.googleapis.com/calendar/v3';
const GMAIL_SEND = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri() {
  return `${baseUrl()}/auth/google/callback`;
}

export function baseUrl() {
  return (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

export function authUrl(state, loginHint) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `${AUTH_URL}?${params}`;
}

export class GoogleError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...body,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(json.error_description || json.error || 'Error de OAuth', res.status);
  return json;
}

// Intercambia el código del callback, guarda los tokens cifrados en el bot y devuelve el email conectado.
export async function connectWithCode(bot, code) {
  const tok = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
  if (!tok.refresh_token) throw new GoogleError('Google no devolvió refresh_token. Revoca el acceso y vuelve a conectar.', 400);
  const info = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
  bot.google = {
    email: info.email,
    scope: tok.scope,
    refreshToken: encrypt(tok.refresh_token),
    accessToken: encrypt(tok.access_token),
    expiresAt: Date.now() + (tok.expires_in - 60) * 1000,
    connectedAt: new Date().toISOString(),
  };
  saveBot(bot);
  return info.email;
}

async function accessToken(bot) {
  const g = bot.google;
  if (!g) throw new GoogleError('Google Calendar no está conectado', 400);
  if (g.accessToken && g.expiresAt > Date.now()) return decrypt(g.accessToken);
  const tok = await tokenRequest({ refresh_token: decrypt(g.refreshToken), grant_type: 'refresh_token' });
  g.accessToken = encrypt(tok.access_token);
  g.expiresAt = Date.now() + (tok.expires_in - 60) * 1000;
  saveBot(bot);
  return tok.access_token;
}

async function gapi(bot, url, { method = 'GET', body } = {}) {
  const token = await accessToken(bot);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(json.error?.message || `Google API ${res.status}`, res.status);
  return json;
}

export function isConnected(bot) {
  return Boolean(bot.google?.refreshToken) && googleConfigured();
}

export async function listCalendars(bot) {
  const json = await gapi(bot, `${CAL}/users/me/calendarList?minAccessRole=writer`);
  return (json.items || []).map((c) => ({
    id: c.id,
    name: c.summaryOverride || c.summary,
    primary: Boolean(c.primary),
    timeZone: c.timeZone,
    color: c.backgroundColor,
  }));
}

export function disconnect(bot) {
  const token = bot.google?.refreshToken ? decrypt(bot.google.refreshToken) : null;
  delete bot.google;
  saveBot(bot);
  if (token) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
}

// ---------- Interfaz común calendario (Google o demo) ----------

// Intervalos ocupados [{start, end}] en ms entre timeMin y timeMax.
export async function getBusy(bot, timeMin, timeMax) {
  if (!isConnected(bot)) {
    return listBookings(bot.id)
      .filter((b) => b.status === 'confirmed')
      .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
      .filter((b) => b.end > timeMin && b.start < timeMax);
  }
  const json = await gapi(bot, `${CAL}/freeBusy`, {
    method: 'POST',
    body: {
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
      items: [{ id: bot.calendarId || 'primary' }],
    },
  });
  const cal = Object.values(json.calendars || {})[0] || {};
  if (cal.errors?.length) throw new GoogleError(`No se pudo leer el calendario: ${cal.errors[0].reason}`, 502);
  return (cal.busy || []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
}

export async function createEvent(bot, ev) {
  if (!isConnected(bot)) return { eventId: `demo_${Date.now()}`, htmlLink: null };
  const calendarId = encodeURIComponent(bot.calendarId || 'primary');
  // Si podemos enviar nuestro propio email de confirmación evitamos duplicar la invitación de Google.
  const sendUpdates = canSendEmail(bot) ? 'none' : 'all';
  const json = await gapi(bot, `${CAL}/calendars/${calendarId}/events?sendUpdates=${sendUpdates}`, {
    method: 'POST',
    body: {
      summary: ev.summary,
      description: ev.description,
      start: { dateTime: new Date(ev.start).toISOString(), timeZone: ev.timeZone },
      end: { dateTime: new Date(ev.end).toISOString(), timeZone: ev.timeZone },
      attendees: ev.attendeeEmail ? [{ email: ev.attendeeEmail, displayName: ev.attendeeName }] : [],
      reminders: { useDefault: true },
      extendedProperties: { private: { agendiaBookingId: ev.bookingId, agendiaBotId: bot.id } },
      transparency: 'opaque',
    },
  });
  return { eventId: json.id, htmlLink: json.htmlLink };
}

export async function deleteEvent(bot, eventId) {
  if (!isConnected(bot) || !eventId || eventId.startsWith('demo_')) return;
  const calendarId = encodeURIComponent(bot.calendarId || 'primary');
  try {
    const sendUpdates = canSendEmail(bot) ? 'none' : 'all';
    await gapi(bot, `${CAL}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`, { method: 'DELETE' });
  } catch (e) {
    if (e.status !== 404 && e.status !== 410) throw e;
  }
}

// Envía un email desde la cuenta de Google conectada. En modo demo se guarda en la bandeja de salida del bot.
export function canSendEmail(bot) {
  return isConnected(bot) && Boolean(bot.google.scope?.includes('gmail.send'));
}

export async function sendEmail(bot, { to, subject, html }) {
  if (!canSendEmail(bot)) {
    bot.outbox = [{ to, subject, html, at: new Date().toISOString() }, ...(bot.outbox || [])].slice(0, 20);
    saveBot(bot);
    return { demo: true };
  }
  const fromName = String(bot.config?.businessName || 'Reservas').replace(/[\r\n"<>]/g, ' ');
  const mime = [
    `From: ${encodeHeader(fromName)} <${bot.google.email}>`,
    `To: ${to}`,
    `Reply-To: ${bot.businessEmail || bot.google.email}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
  ].join('\r\n');
  await gapi(bot, GMAIL_SEND, { method: 'POST', body: { raw: Buffer.from(mime).toString('base64url') } });
  return { demo: false };
}

function encodeHeader(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}
