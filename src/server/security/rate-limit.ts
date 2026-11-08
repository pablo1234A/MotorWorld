import "server-only";

import { sql } from "kysely";

import { withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

/**
 * Rate limiting (ADR-013): token bucket atómico en PostgreSQL
 * (`private.rate_limit_consume`). La interfaz permite sustituirlo por Redis
 * cuando la escala lo requiera, sin tocar a quien lo usa.
 */
export interface RateLimitRule {
  /** Peticiones permitidas en ráfaga. */
  capacity: number;
  /** Ventana en segundos en la que se recupera la capacidad completa. */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  signUpPerIp: { capacity: 5, windowSeconds: 3600 },
  signInPerIp: { capacity: 20, windowSeconds: 900 },
  signInPerEmail: { capacity: 8, windowSeconds: 900 },
  passwordResetPerIp: { capacity: 5, windowSeconds: 3600 },
  passwordResetPerEmail: { capacity: 3, windowSeconds: 3600 },
  resendVerificationPerEmail: { capacity: 3, windowSeconds: 3600 },
  invitationsPerOrg: { capacity: 30, windowSeconds: 3600 },
  invitationAcceptPerIp: { capacity: 20, windowSeconds: 900 },
  importUploadsPerOrg: { capacity: 30, windowSeconds: 3600 },
  testEmailsPerOrg: { capacity: 20, windowSeconds: 86_400 },
  domainChecksPerOrg: { capacity: 30, windowSeconds: 3600 },
  domainCreatesPerOrg: { capacity: 5, windowSeconds: 86_400 },
  bookingPerIp: { capacity: 5, windowSeconds: 3600 },
  bookingPerOrg: { capacity: 60, windowSeconds: 3600 },
  /** Documentos y fotos: 200 subidas por hora y taller. */
  documentUploadsPerOrg: { capacity: 200, windowSeconds: 3600 },
  pciEmailsPerOrg: { capacity: 100, windowSeconds: 3600 },
  /** Códigos de la verificación en dos pasos: 10 intentos cada 15 min por usuario. */
  mfaVerifyPerUser: { capacity: 10, windowSeconds: 900 },
  /** API pública: 60 peticiones/min sostenidas, ráfaga de 120, por clave… */
  apiPerKey: { capacity: 120, windowSeconds: 120 },
  /** …y 120/min, ráfaga de 600, por taller (todas sus claves). */
  apiPerOrg: { capacity: 600, windowSeconds: 300 },
} as const satisfies Record<string, RateLimitRule>;

export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
): Promise<boolean> {
  const refillPerSecond = rule.capacity / rule.windowSeconds;
  return withSystem(async (tx) => {
    const { rows } = await sql<{ allowed: boolean }>`
      select private.rate_limit_consume(${key}, ${rule.capacity}, ${refillPerSecond}::double precision, 1) as allowed
    `.execute(tx);
    return rows[0]?.allowed === true;
  });
}

/** Lanza `rate_limited` si se supera cualquiera de las reglas indicadas. */
export async function enforceRateLimits(
  checks: ReadonlyArray<readonly [key: string, rule: RateLimitRule]>,
): Promise<void> {
  for (const [key, rule] of checks) {
    if (!(await consumeRateLimit(key, rule))) {
      throw new DomainError("rate_limited");
    }
  }
}
