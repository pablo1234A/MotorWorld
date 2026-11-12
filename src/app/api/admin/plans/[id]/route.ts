import { isUuid } from "@/lib/utils";
import { requireApiAdmin } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, parseBody, route } from "@/server/http/handler";
import { adminUpdatePlan } from "@/server/services/admin";
import { adminPlanSchema } from "@/validation/schemas";

export const PATCH = route<{ id: string }>(async (request, { id }) => {
  const actor = await requireApiAdmin();
  if (!isUuid(id)) throw notFound("El plan");
  const input = await parseBody(request, adminPlanSchema);
  await adminUpdatePlan(actor, id, input);
  return ok({ updated: true });
});
