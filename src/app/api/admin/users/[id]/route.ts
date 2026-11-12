import { isUuid } from "@/lib/utils";
import { requireApiAdmin } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, parseBody, route } from "@/server/http/handler";
import { adminSetUserDisabled } from "@/server/services/admin";
import { adminUserActionSchema } from "@/validation/schemas";

export const PATCH = route<{ id: string }>(async (request, { id }) => {
  const actor = await requireApiAdmin();
  if (!isUuid(id)) throw notFound("El usuario");
  const input = await parseBody(request, adminUserActionSchema);
  await adminSetUserDisabled(actor, id, input.action === "disable", input.action === "disable" ? input.reason : undefined);
  return ok({ disabled: input.action === "disable" });
});
