import { isUuid } from "@/lib/utils";
import { requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, parseBody, route } from "@/server/http/handler";
import { removeMember, setMemberRole } from "@/server/services/team";
import { memberRoleSchema } from "@/validation/schemas";

type Params = { userId: string };

export const PATCH = route<Params>(async (request, { userId }) => {
  const context = await requireApiSession();
  if (!isUuid(userId)) throw notFound("El miembro");
  const input = await parseBody(request, memberRoleSchema);
  await setMemberRole(context, userId, input.role);
  return ok({ role: input.role });
});

/** Expulsa a un miembro o, si es el propio usuario, abandona el espacio. */
export const DELETE = route<Params>(async (_request, { userId }) => {
  const context = await requireApiSession();
  if (!isUuid(userId)) throw notFound("El miembro");
  await removeMember(context, userId);
  return ok({ removed: true });
});
