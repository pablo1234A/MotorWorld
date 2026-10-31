import { redis } from "../redis";
import { logger } from "../logger";
import { AppError } from "./errors";

/**
 * Limitador de ventana fija en Redis. Atómico (INCR + PEXPIRE en MULTI),
 * válido con varias instancias de la aplicación.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; remaining: number; retryAfter: number }> {
  try {
    const k = `rl:${key}`;
    const res = await redis().multi().incr(k).pttl(k).exec();
    const count = Number(res?.[0]?.[1] ?? 0);
    let ttl = Number(res?.[1]?.[1] ?? -1);
    if (ttl < 0) {
      await redis().pexpire(k, windowSec * 1000);
      ttl = windowSec * 1000;
    }
    return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfter: Math.ceil(ttl / 1000) };
  } catch (err) {
    // Si Redis no está disponible no bloqueamos el servicio; el bloqueo de cuenta en BD sigue protegiendo el login.
    logger.warn({ err, key }, "rate limit no disponible (Redis)");
    return { ok: true, remaining: limit, retryAfter: 0 };
  }
}

export async function enforceRateLimit(key: string, limit: number, windowSec: number, message = "Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.") {
  const r = await rateLimit(key, limit, windowSec);
  if (!r.ok) throw new AppError("RATE_LIMITED", message, { retryAfter: r.retryAfter });
}
