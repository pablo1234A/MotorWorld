import { isUuid } from "@/lib/utils";
import { assertCanEdit, requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { limitUser, ok, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { getJob, processJobBatch } from "@/server/services/jobs";

export const maxDuration = 60;

/**
 * Procesa UN lote del trabajo y devuelve el progreso. El cliente repite la llamada
 * hasta que el estado deja de ser pending/processing.
 */
export const POST = route<{ id: string }>(async (_request, { id }) => {
  const context = await requireApiSession();
  assertCanEdit(context);
  await limitUser(RATE_LIMITS.jobProcess, context.user.id);
  if (!isUuid(id)) throw notFound("El trabajo");
  await getJob(context, id); // 404 si el trabajo no pertenece al workspace de la sesión
  return ok(await processJobBatch(context.supabase, id));
});
