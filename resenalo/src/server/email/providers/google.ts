/* eslint-disable @typescript-eslint/no-explicit-any -- respuestas JSON de APIs externas con forma variable; se validan campo a campo */
import { env } from "../../env";
import { fetchWithTimeout, ProviderError, readError, retryAfter, type ConnectedIdentity, type MailProvider, type TokenSet } from "./types";

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"];
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function parseTokenResponse(json: any): TokenSet {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + (Number(json.expires_in ?? 3600) - 30) * 1000),
    scope: json.scope ?? "",
  };
}

async function tokenRequest(params: Record<string, string>): Promise<any> {
  const res = await fetchWithTimeout(env().GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const { json, text } = await readError(res);
    const code = json?.error;
    if (code === "invalid_grant" || code === "unauthorized_client" || res.status === 401)
      throw new ProviderError("auth", `Google rechazó la autorización (${code ?? res.status}).`, res.status);
    if (res.status >= 500 || res.status === 429) throw new ProviderError("transient", `Google no disponible (${res.status}).`, res.status, retryAfter(res));
    throw new ProviderError("permanent", `Error OAuth de Google: ${code ?? text}`, res.status);
  }
  return res.json();
}

export const googleProvider: MailProvider = {
  id: "GOOGLE",
  label: "Gmail",
  isConfigured: () => Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET),

  authorizeUrl({ state, codeChallenge, redirectUri, loginHint }) {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({
      client_id: env().GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent", // garantiza refresh_token
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      ...(loginHint ? { login_hint: loginHint } : {}),
    }).toString();
    return u.toString();
  },

  async exchangeCode({ code, codeVerifier, redirectUri }): Promise<ConnectedIdentity> {
    const json = await tokenRequest({
      code,
      code_verifier: codeVerifier,
      client_id: env().GOOGLE_CLIENT_ID!,
      client_secret: env().GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    const tokens = parseTokenResponse(json);
    if (!tokens.scope.split(" ").includes(SEND_SCOPE))
      throw new ProviderError("auth", "No se concedió el permiso para enviar correos en tu nombre. Vuelve a conectar y marca la casilla de envío de Gmail.");
    if (!tokens.refreshToken) throw new ProviderError("auth", "Google no devolvió un token de actualización. Revoca el acceso a Reseñalo en tu cuenta de Google y vuelve a conectar.");
    const res = await fetchWithTimeout(env().GOOGLE_USERINFO_URL, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
    if (!res.ok) throw new ProviderError("transient", `No se pudo obtener la cuenta de Google (${res.status}).`, res.status);
    const info = await res.json();
    if (!info.email || info.email_verified === false) throw new ProviderError("auth", "La cuenta de Google no tiene un correo verificado.");
    return { ...tokens, email: String(info.email).toLowerCase(), displayName: info.name ?? null };
  },

  async refresh(refreshToken) {
    const json = await tokenRequest({
      refresh_token: refreshToken,
      client_id: env().GOOGLE_CLIENT_ID!,
      client_secret: env().GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    });
    const t = parseTokenResponse(json);
    if (t.scope && !t.scope.split(" ").includes(SEND_SCOPE)) throw new ProviderError("auth", "El permiso de envío de Gmail ya no está concedido.");
    return t;
  },

  async send(accessToken, mime) {
    const res = await fetchWithTimeout(`${env().GOOGLE_GMAIL_API_URL}/gmail/v1/users/me/messages/send`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: mime.toString("base64url") }),
    });
    if (res.ok) {
      const json = await res.json();
      if (!json?.id) throw new ProviderError("transient", "Gmail respondió sin identificador de mensaje.");
      return { providerMessageId: String(json.id) };
    }
    const { json, text } = await readError(res);
    const reason: string = json?.error?.errors?.[0]?.reason ?? json?.error?.status ?? "";
    const msg: string = json?.error?.message ?? text;
    if (res.status === 401) throw new ProviderError("auth", "Gmail: autorización caducada o revocada.", 401);
    if (res.status === 429 || /rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quotaExceeded/i.test(reason))
      throw new ProviderError("rate_limit", `Gmail: límite de envío del proveedor alcanzado (${reason || res.status}).`, res.status, retryAfter(res) ?? 900);
    if (res.status === 403) throw new ProviderError("auth", `Gmail: permiso denegado (${reason || msg}).`, 403);
    if (res.status >= 500) throw new ProviderError("transient", `Gmail no disponible (${res.status}).`, res.status, retryAfter(res));
    if (res.status === 400 && /recipient|address|To header/i.test(msg)) throw new ProviderError("invalid_recipient", `Gmail rechazó el destinatario: ${msg}`, 400);
    throw new ProviderError("permanent", `Gmail rechazó el mensaje: ${msg}`, res.status);
  },

  async revoke(token) {
    await fetchWithTimeout(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    }).catch(() => undefined);
  },
};
