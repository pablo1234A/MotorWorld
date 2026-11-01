/* eslint-disable @typescript-eslint/no-explicit-any -- respuestas JSON de Twilio con forma variable */
import { createHmac } from "node:crypto";
import { env } from "../env";
import { fetchWithTimeout, ProviderError, readError, retryAfter } from "../email/providers/types";
import { safeEqual } from "../crypto";

export type SmsSend = { to: string; body: string; from?: string | null; statusCallback?: string };
export interface SmsProvider {
  isConfigured(): boolean;
  /** Solo resuelve si Twilio acepta el mensaje (estado queued/accepted/sent). */
  send(m: SmsSend): Promise<{ providerMessageId: string; status: string }>;
}

// Códigos de error de Twilio: https://www.twilio.com/docs/api/errors
const INVALID_RECIPIENT = new Set([21211, 21214, 21217, 21265, 21407, 21408, 21610, 21612, 21614]);

export const twilioProvider: SmsProvider = {
  isConfigured: () => Boolean(env().TWILIO_ACCOUNT_SID && env().TWILIO_AUTH_TOKEN && (env().TWILIO_MESSAGING_SERVICE_SID || env().TWILIO_FROM)),
  async send(m) {
    const e = env();
    const form = new URLSearchParams({ To: m.to, Body: m.body });
    if (e.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", e.TWILIO_MESSAGING_SERVICE_SID);
    const from = m.from || e.TWILIO_FROM;
    if (from) form.set("From", from);
    if (m.statusCallback) form.set("StatusCallback", m.statusCallback);
    const res = await fetchWithTimeout(`${e.TWILIO_API_URL}/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: "Basic " + Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString("base64"),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (res.ok) {
      const j: any = await res.json();
      if (!j?.sid) throw new ProviderError("transient", "Twilio respondió sin identificador de mensaje.");
      return { providerMessageId: String(j.sid), status: String(j.status ?? "queued") };
    }
    const { json, text } = await readError(res);
    const code = Number(json?.code ?? 0);
    const msg = `${json?.message ?? text}`.slice(0, 300);
    if (INVALID_RECIPIENT.has(code)) throw new ProviderError("invalid_recipient", `Twilio rechazó el número (${code}): ${msg}`, res.status);
    if (res.status === 429 || code === 20429) throw new ProviderError("rate_limit", "Twilio: límite de envío alcanzado.", res.status, retryAfter(res) ?? 300);
    // 401/403: credenciales de la plataforma; se reintenta (y se reporta) para no perder el envío mientras se corrige.
    if (res.status === 401 || res.status === 403 || res.status >= 500) throw new ProviderError("transient", `Twilio no disponible o mal configurado (${res.status} ${code}): ${msg}`, res.status, retryAfter(res));
    throw new ProviderError("permanent", `Twilio rechazó el mensaje (${code}): ${msg}`, res.status);
  },
};

let override: SmsProvider | null = null;
export const getSmsProvider = () => override ?? twilioProvider;
export const setSmsProviderOverride = (p: SmsProvider | null) => (override = p);

/** Firma X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + claves ordenadas con sus valores)). */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

export function verifyTwilioSignature(url: string, params: Record<string, string>, header: string | null) {
  const token = env().TWILIO_AUTH_TOKEN;
  if (!token || !header) return false;
  return safeEqual(twilioSignature(token, url, params), header);
}
