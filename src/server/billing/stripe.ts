import "server-only";

import Stripe from "stripe";

/**
 * Cliente de Stripe (solo servidor). Reglas de seguridad de pagos:
 *  - Sin STRIPE_SECRET_KEY no hay pagos: las pantallas lo indican y no se simula nada.
 *  - Mientras PAYMENTS_LIVE_ENABLED no sea true (decisión del responsable adulto
 *    del proyecto, tras revisar fiscalidad y legalidad), una clave sk_live_
 *    impide arrancar la aplicación (src/server/env.ts) y CUALQUIER objeto de
 *    Stripe en modo live se rechaza aquí (assertTestMode).
 *  - STRIPE_API_BASE solo para pruebas locales con stripe-mock.
 */

let client: Stripe | null | undefined;

export function paymentsLiveEnabled(): boolean {
  return process.env.PAYMENTS_LIVE_ENABLED === "true";
}

export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return (client = null);
  if (key.startsWith("sk_live_") && !paymentsLiveEnabled()) {
    throw new Error("Clave LIVE de Stripe bloqueada: los pagos están en modo TEST");
  }
  const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
  client = new Stripe(key, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "RevisaYa" },
    ...(base ? { host: base.hostname, port: Number(base.port || 80), protocol: base.protocol.replace(":", "") as "http" | "https" } : {}),
  });
  return client;
}

/** Solo para tests: fuerza a releer la configuración. */
export function resetStripeClient(): void {
  client = undefined;
}

export class LiveModeBlockedError extends Error {
  constructor() {
    super("stripe_livemode_blocked");
    this.name = "LiveModeBlockedError";
  }
}

/** Un objeto o evento de Stripe en modo LIVE no se procesa mientras los pagos estén en TEST. */
export function assertTestMode(obj: { livemode?: boolean | null }): void {
  if (obj.livemode && !paymentsLiveEnabled()) throw new LiveModeBlockedError();
}
