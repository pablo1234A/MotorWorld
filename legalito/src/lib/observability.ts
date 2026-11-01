import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { ipHash } from "@/lib/request";

type ActorType = "user" | "admin" | "system" | "stripe";

export interface AuditEntry {
  actorId?: string | null;
  actorType?: ActorType;
  action: string;
  entityType?: string;
  entityId?: string;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Registro de auditoría de operaciones relevantes. Nunca interrumpe el flujo principal. */
export async function audit(entry: AuditEntry, opts: { withIp?: boolean } = {}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await createAdminClient()
      .from("audit_logs")
      .insert({
        actor_id: entry.actorId ?? null,
        actor_type: entry.actorType ?? "user",
        action: entry.action,
        entity_type: entry.entityType ?? null,
        entity_id: entry.entityId ?? null,
        organization_id: entry.organizationId ?? null,
        metadata: entry.metadata ?? {},
        ip_hash: opts.withIp ? await ipHash().catch(() => null) : null,
      });
  } catch (e) {
    console.error("[audit] no se pudo registrar", entry.action, e);
  }
}

/** Registra un error de aplicación para su consulta en administración. */
export async function logError(source: string, error: unknown, context: Record<string, unknown> = {}): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${source}]`, error);
  if (!isSupabaseConfigured()) return;
  try {
    await createAdminClient()
      .from("app_errors")
      .insert({
        source,
        message: message.slice(0, 2000),
        context: { ...context, stack: error instanceof Error ? error.stack?.split("\n").slice(0, 6).join("\n") : undefined },
      });
  } catch (e) {
    console.error("[logError] no se pudo registrar el error", e);
  }
}

/** Limitación de frecuencia respaldada en base de datos (ventana fija). */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;
  const { data, error } = await createAdminClient().rpc("check_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    await logError("rate_limit", error, { key });
    return true; // Ante un fallo del limitador no se bloquea al usuario legítimo.
  }
  return data === true;
}
