import "server-only";
import { createHash } from "node:crypto";
import { getAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type RateLimitRule = { name: string; max: number; windowSeconds: number };

/** Reglas centralizadas: ajusta aquí los límites de cada grupo de endpoints. */
export const RATE_LIMITS = {
  login: { name: "login", max: 8, windowSeconds: 300 },
  register: { name: "register", max: 5, windowSeconds: 3600 },
  passwordReset: { name: "password-reset", max: 5, windowSeconds: 3600 },
  contact: { name: "contact", max: 5, windowSeconds: 3600 },
  generate: { name: "generate", max: 30, windowSeconds: 60 },
  upload: { name: "upload", max: 40, windowSeconds: 60 },
  mutation: { name: "mutation", max: 120, windowSeconds: 60 },
  jobProcess: { name: "job-process", max: 120, windowSeconds: 60 },
  export: { name: "export", max: 30, windowSeconds: 60 },
  accountSensitive: { name: "account-sensitive", max: 10, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>;

const memory = new Map<string, { windowStart: number; count: number }>();
let warned = false;

function memoryHit(key: string, rule: RateLimitRule): boolean {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const current = memory.get(key);
  if (!current || current.windowStart !== windowStart) {
    if (memory.size > 5000) memory.clear();
    memory.set(key, { windowStart, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= rule.max;
}

/**
 * Devuelve true si la petición está permitida.
 * Usa un contador en PostgreSQL (válido entre instancias serverless). Si la clave
 * de servicio no está configurada o la base de datos falla, recurre a un contador
 * en memoria por instancia para no dejar el endpoint sin protección.
 */
export async function checkRateLimit(rule: RateLimitRule, identifier: string): Promise<boolean> {
  const key = `${rule.name}:${createHash("sha256").update(identifier).digest("hex").slice(0, 40)}`;
  if (!hasAdminClient()) {
    if (!warned) {
      warned = true;
      logger.warn("rate_limit.memory_fallback", { reason: "SUPABASE_SERVICE_ROLE_KEY ausente" });
    }
    return memoryHit(key, rule);
  }
  const { data, error } = await getAdminClient().rpc("check_rate_limit", {
    p_key: key,
    p_max: rule.max,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    logger.error("rate_limit.db_error", { error: error.message });
    return memoryHit(key, rule);
  }
  return data === true;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
