import "server-only";
import type { Db, Json } from "@/lib/supabase/types";
import { logger } from "@/lib/logger";

/** Registra una acción relevante. Un fallo de auditoría nunca interrumpe la operación. */
export async function audit(
  supabase: Db,
  entry: { workspaceId: string | null; action: string; resourceType: string; resourceId?: string | null; metadata?: Record<string, Json> },
) {
  const { error } = await supabase.rpc("log_audit_event", {
    p_workspace: entry.workspaceId as string,
    p_action: entry.action,
    p_resource_type: entry.resourceType,
    p_resource_id: entry.resourceId ?? undefined,
    p_metadata: entry.metadata ?? {},
  });
  if (error) logger.warn("audit.write_failed", { action: entry.action, error: error.message });
}
