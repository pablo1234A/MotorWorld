/* eslint-disable @typescript-eslint/no-explicit-any -- respuestas JSON de la API de SMS Gate con forma variable */
import { fetchWithTimeout, ProviderError, readError, retryAfter } from "../email/providers/types";

/**
 * SMS Gate for Android (https://sms-gate.app): app de código abierto que convierte
 * el móvil Android del negocio en pasarela SMS. Los mensajes salen de SU SIM, con SU
 * número y con cargo a SU tarifa. Modo «servidor en la nube»: la API retransmite al móvil.
 * Contrato tomado del cliente oficial `android-sms-gateway` (API 3rdparty v1).
 */
export const SMSGATE_CLOUD_URL = "https://api.sms-gate.app/3rdparty/v1";

export type GatewayCreds = { apiBaseUrl: string; login: string; password: string; deviceId?: string | null };
export type GatewayState = "Pending" | "Processed" | "Sent" | "Delivered" | "Failed" | "Cancelling" | "Cancelled";
export type GatewayDevice = { id: string; name: string; lastSeen: string | null };

export interface SmsGateway {
  listDevices(c: GatewayCreds): Promise<GatewayDevice[]>;
  /** Encola el SMS en el móvil del negocio. Que se acepte NO significa que ya se haya enviado. */
  send(c: GatewayCreds, m: { to: string; text: string; id: string; ttlSeconds: number }): Promise<{ messageId: string; state: GatewayState }>;
  getState(c: GatewayCreds, messageId: string): Promise<{ state: GatewayState; error: string | null }>;
  cancel(c: GatewayCreds, messageId: string): Promise<void>;
  registerWebhook(c: GatewayCreds, event: "sms:sent" | "sms:delivered" | "sms:failed", url: string): Promise<string | null>;
  deleteWebhook(c: GatewayCreds, id: string): Promise<void>;
}

const auth = (c: GatewayCreds) => ({ authorization: "Basic " + Buffer.from(`${c.login}:${c.password}`).toString("base64") });

async function call(c: GatewayCreds, path: string, init: RequestInit = {}) {
  const res = await fetchWithTimeout(`${c.apiBaseUrl.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: { ...auth(c), ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
  });
  if (res.ok) return res.status === 204 || res.headers.get("content-length") === "0" ? {} : res.json().catch(() => ({}));
  const { json, text } = await readError(res);
  const msg = String(json?.message ?? json?.error ?? text).slice(0, 300);
  if (res.status === 401 || res.status === 403) throw new ProviderError("auth", "SMS Gate rechazó el usuario o la contraseña del móvil. Revisa los datos de la app.", res.status);
  if (res.status === 429) throw new ProviderError("rate_limit", "SMS Gate: límite de envío alcanzado.", 429, retryAfter(res) ?? 300);
  if (res.status >= 500) throw new ProviderError("transient", `SMS Gate no disponible (${res.status}).`, res.status, retryAfter(res));
  if (res.status === 400 && /phone|number|n[úu]mero/i.test(msg)) throw new ProviderError("invalid_recipient", `Número rechazado por SMS Gate: ${msg}`, 400);
  throw new ProviderError("permanent", `SMS Gate rechazó la petición (${res.status}): ${msg}`, res.status);
}

const STATES: GatewayState[] = ["Pending", "Processed", "Sent", "Delivered", "Failed", "Cancelling", "Cancelled"];
const asState = (v: unknown): GatewayState => (STATES.includes(v as GatewayState) ? (v as GatewayState) : "Pending");

export const smsGate: SmsGateway = {
  async listDevices(c) {
    const j = await call(c, "/devices");
    const list = Array.isArray(j) ? j : (j.devices ?? []);
    return list.filter((d: any) => !d.deletedAt).map((d: any) => ({ id: String(d.id), name: String(d.name ?? "Android"), lastSeen: d.lastSeen ?? null }));
  },
  async send(c, m) {
    const body = {
      id: m.id,
      textMessage: { text: m.text },
      phoneNumbers: [m.to],
      withDeliveryReport: true,
      ttl: m.ttlSeconds,
      ...(c.deviceId ? { deviceId: c.deviceId } : {}),
    };
    const j = await call(c, "/message", { method: "POST", body: JSON.stringify(body) });
    if (!j?.id) throw new ProviderError("transient", "SMS Gate respondió sin identificador de mensaje.");
    return { messageId: String(j.id), state: asState(j.state) };
  },
  async getState(c, messageId) {
    const j = await call(c, `/message/${encodeURIComponent(messageId)}`);
    const r = Array.isArray(j.recipients) ? j.recipients[0] : null;
    return { state: asState(r?.state ?? j.state), error: r?.error ?? null };
  },
  async cancel(c, messageId) {
    await call(c, `/message/${encodeURIComponent(messageId)}`, { method: "DELETE" }).catch(() => undefined);
  },
  async registerWebhook(c, event, url) {
    const j = await call(c, "/webhooks", { method: "POST", body: JSON.stringify({ event, url, ...(c.deviceId ? { deviceId: c.deviceId } : {}) }) });
    return j?.id ? String(j.id) : null;
  },
  async deleteWebhook(c, id) {
    await call(c, `/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
  },
};

let override: SmsGateway | null = null;
export const getSmsGateway = () => override ?? smsGate;
/** Solo para pruebas automatizadas. */
export const setSmsGatewayOverride = (g: SmsGateway | null) => (override = g);
