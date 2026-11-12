import { isUuid } from "@/lib/utils";
import { requireApiAdmin } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, parseBody, route } from "@/server/http/handler";
import { adminSetWorkspacePlan } from "@/server/services/admin";
import { adminWorkspacePlanSchema } from "@/validation/schemas";

export const PATCH = route<{ id: string }>(async (request, { id }) => {
  const actor = await requireApiAdmin();
  if (!isUuid(id)) throw notFound("El espacio de trabajo");
  const input = await parseBody(request, adminWorkspacePlanSchema);
  await adminSetWorkspacePlan(actor, id, input.planCode, input.reason);
  return ok({ planCode: input.planCode });
});
