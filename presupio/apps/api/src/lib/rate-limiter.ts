import type { RateLimitRule } from '../config.js';

/**
 * Limitador de ventana fija por clave (p. ej. IP o email), en memoria.
 * Suficiente para una instancia. Para varias instancias se sustituirá por un
 * almacén compartido (Redis) en la fase de producción, manteniendo esta interfaz.
 */
export interface KeyedLimiter {
  /** Registra un intento y devuelve false si la clave ha superado el límite. */
  hit(key: string): boolean;
  /** Indica si la clave está bloqueada sin registrar un intento nuevo. */
  isBlocked(key: string): boolean;
  reset(key: string): void;
}

export function createMemoryLimiter(rule: RateLimitRule, now: () => number = Date.now): KeyedLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = now();

  function sweep(t: number) {
    if (t - lastSweep < rule.windowMs) return;
    lastSweep = t;
    for (const [key, bucket] of buckets) if (bucket.resetAt <= t) buckets.delete(key);
  }

  return {
    hit(key) {
      const t = now();
      sweep(t);
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= t) {
        buckets.set(key, { count: 1, resetAt: t + rule.windowMs });
        return 1 <= rule.max;
      }
      bucket.count += 1;
      return bucket.count <= rule.max;
    },
    isBlocked(key) {
      const bucket = buckets.get(key);
      return !!bucket && bucket.resetAt > now() && bucket.count >= rule.max;
    },
    reset(key) {
      buckets.delete(key);
    },
  };
}
