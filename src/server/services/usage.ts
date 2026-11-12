import "server-only";
import { parseUsageState, type UsageState } from "@/domain/plans";
import { logger } from "@/lib/logger";
import { getAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import type { Db, Json } from "@/lib/supabase/types";
import { fromDbError } from "@/server/http/handler";

export async function getUsage(supabase: Db, workspaceId: string): Promise<UsageState> {
  const { data, error } = await supabase.rpc("get_usage_summary", { p_workspace: workspaceId });
  if (error) throw fromDbError(error);
  return parseUsageState(data);
}

export type ConsumeResult = { allowed: boolean; duplicate: boolean; usage: UsageState };

/**
 * Registra una generación de forma atómica en la base de datos.
 * La función SQL bloquea la suscripción del workspace, por lo que dos peticiones
 * simultáneas nunca superan el límite, y usa la clave de idempotencia para que
 * un reintento técnico no se contabilice dos veces.
 */
export async function consumeUsage(
  supabase: Db,
  workspaceId: string,
  operation: "generation" | "refinement",
  idempotencyKey: string,
  metadata: Record<string, Json> = {},
): Promise<ConsumeResult> {
  const { data, error } = await supabase.rpc("consume_usage", {
    p_workspace: workspaceId,
    p_operation: operation,
    p_idempotency_key: idempotencyKey,
    p_metadata: metadata,
  });
  if (error) throw fromDbError(error);
  const raw = (data ?? {}) as Record<string, unknown>;
  return { allowed: raw.allowed === true, duplicate: raw.duplicate === true, usage: parseUsageState(raw) };
}

/** Devuelve la cuota cuando el fallo es atribuible al sistema (requiere service_role). */
export async function refundUsage(workspaceId: string, idempotencyKey: string): Promise<boolean> {
  if (!hasAdminClient()) {
    logger.error("usage.refund_unavailable", { workspaceId, reason: "SUPABASE_SERVICE_ROLE_KEY ausente" });
    return false;
  }
  const { data, error } = await getAdminClient().rpc("refund_usage", { p_workspace: workspaceId, p_idempotency_key: idempotencyKey });
  if (error) {
    logger.error("usage.refund_failed", { workspaceId, error: error.message });
    return false;
  }
  return data === true;
}
