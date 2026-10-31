import { env } from "../../env";
import { fetchWithTimeout, ProviderError, readError, retryAfter, type ConnectedIdentity, type MailProvider, type TokenSet } from "./types";

export const MICROSOFT_SCOPES = ["offline_access", "openid", "email", "User.Read", "Mail.Send"];

const base = () => `${env().MICROSOFT_LOGIN_URL}/${env().MICROSOFT_TENANT}/oauth2/v2.0`;

function parse(json: any): TokenSet {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + (Number(json.expires_in ?? 3600) - 30) * 1000),
    scope: json.scope ?? "",
  };
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetchWithTimeout(`${base()}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env().MICROSOFT_CLIENT_ID!,
      client_secret: env().MICROSOFT_CLIENT_SECRET!,
      scope: MICROSOFT_SCOPES.join(" "),
      ...params,
    }).toString(),
  });
  if (!res.ok) {
    const { json, text } = await readError(res);
    const code = json?.error;
    if (code === "invalid_grant" || code === "interaction_required" || code === "consent_required" || res.status === 401)
      throw new ProviderError("auth", `Microsoft rechazó la autorización (${code ?? res.status}).`, res.status);
    if (res.status >= 500 || res.status === 429) throw new ProviderError("transient", `Microsoft no disponible (${res.status}).`, res.status, retryAfter(res));
    throw new ProviderError("permanent", `Error OAuth de Microsoft: ${json?.error_description?.split("\r\n")[0] ?? text}`, res.status);
  }
  return res.json();
}

export const microsoftProvider: MailProvider = {
  id: "MICROSOFT",
  label: "Outlook / Microsoft 365",
  isConfigured: () => Boolean(env().MICROSOFT_CLIENT_ID && env().MICROSOFT_CLIENT_SECRET),

  authorizeUrl({ state, codeChallenge, redirectUri, loginHint }) {
    const u = new URL(`${base()}/authorize`);
    u.search = new URLSearchParams({
      client_id: env().MICROSOFT_CLIENT_ID!,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: MICROSOFT_SCOPES.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
      ...(loginHint ? { login_hint: loginHint } : {}),
    }).toString();
    return u.toString();
  },

  async exchangeCode({ code, codeVerifier, redirectUri }): Promise<ConnectedIdentity> {
    const tokens = parse(await tokenRequest({ code, code_verifier: codeVerifier, redirect_uri: redirectUri, grant_type: "authorization_code" }));
    if (!/Mail\.Send/i.test(tokens.scope)) throw new ProviderError("auth", "No se concedió el permiso Mail.Send.");
    if (!tokens.refreshToken) throw new ProviderError("auth", "Microsoft no devolvió un token de actualización (offline_access).");
    const res = await fetchWithTimeout(`${env().MICROSOFT_GRAPH_URL}/v1.0/me?$select=mail,userPrincipalName,displayName`, {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!res.ok) throw new ProviderError("transient", `No se pudo obtener la cuenta de Microsoft (${res.status}).`, res.status);
    const me = await res.json();
    const email = String(me.mail || me.userPrincipalName || "").toLowerCase();
    if (!email.includes("@")) throw new ProviderError("auth", "La cuenta de Microsoft no tiene un buzón de correo asociado.");
    return { ...tokens, email, displayName: me.displayName ?? null };
  },

  async refresh(refreshToken) {
    return parse(await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" }));
  },

  async send(accessToken, mime) {
    // Graph admite el envío de MIME completo (base64) → mismas cabeceras que en Gmail (List-Unsubscribe, Message-ID…).
    const res = await fetchWithTimeout(`${env().MICROSOFT_GRAPH_URL}/v1.0/me/sendMail`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "text/plain" },
      body: mime.toString("base64"),
    });
    if (res.status === 202) return { providerMessageId: null }; // Graph confirma aceptación sin devolver id
    const { json, text } = await readError(res);
    const code: string = json?.error?.code ?? "";
    const msg: string = json?.error?.message ?? text;
    if (res.status === 401 || code === "InvalidAuthenticationToken") throw new ProviderError("auth", "Outlook: autorización caducada o revocada.", res.status);
    if (res.status === 429 || code === "ErrorExceededMessageLimit" || code === "MailboxConcurrency")
      throw new ProviderError("rate_limit", `Outlook: límite del proveedor alcanzado (${code || res.status}).`, res.status, retryAfter(res) ?? 900);
    if (res.status === 403 || code === "ErrorAccessDenied") throw new ProviderError("auth", `Outlook: permiso denegado (${code || msg}).`, res.status);
    if (res.status >= 500) throw new ProviderError("transient", `Outlook no disponible (${res.status}).`, res.status, retryAfter(res));
    if (/Recipient|ErrorInvalidRecipients/i.test(code + msg)) throw new ProviderError("invalid_recipient", `Outlook rechazó el destinatario: ${msg}`, res.status);
    throw new ProviderError("permanent", `Outlook rechazó el mensaje: ${code} ${msg}`.trim(), res.status);
  },

  async revoke() {
    // Microsoft no ofrece revocación de un token individual por API para apps públicas multi-tenant.
    // Se eliminan los tokens localmente; el usuario puede retirar el permiso en https://myaccount.microsoft.com/
  },
};
