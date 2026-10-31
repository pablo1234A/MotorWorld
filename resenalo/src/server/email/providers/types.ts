/* eslint-disable @typescript-eslint/no-explicit-any -- respuestas JSON de APIs externas con forma variable; se validan campo a campo */
export type ProviderErrorKind = "auth" | "rate_limit" | "transient" | "permanent" | "invalid_recipient";

/** Error normalizado de un proveedor de correo (Gmail / Microsoft Graph). */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope: string;
};

export type ConnectedIdentity = TokenSet & { email: string; displayName?: string | null };

export interface MailProvider {
  readonly id: "GOOGLE" | "MICROSOFT";
  readonly label: string;
  isConfigured(): boolean;
  authorizeUrl(p: { state: string; codeChallenge: string; redirectUri: string; loginHint?: string }): string;
  exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<ConnectedIdentity>;
  refresh(refreshToken: string): Promise<TokenSet>;
  /** Envía un mensaje MIME completo. Solo resuelve si el proveedor confirma la aceptación. */
  send(accessToken: string, mime: Buffer): Promise<{ providerMessageId: string | null }>;
  revoke(token: string): Promise<void>;
}

export async function readError(res: Response): Promise<{ text: string; json: any }> {
  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* no JSON */
  }
  return { text: text.slice(0, 500), json };
}

export function retryAfter(res: Response): number | undefined {
  const v = res.headers.get("retry-after");
  if (!v) return undefined;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.min(Math.max(n, 1), 3600);
  const d = Date.parse(v);
  return Number.isFinite(d) ? Math.min(Math.max(Math.ceil((d - Date.now()) / 1000), 1), 3600) : undefined;
}

export async function fetchWithTimeout(url: string, init: RequestInit, ms = 20_000): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (err) {
    throw new ProviderError("transient", `Error de red con el proveedor: ${(err as Error).message}`);
  }
}
