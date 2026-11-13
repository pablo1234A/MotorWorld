import { isUuid } from "@/lib/utils";
import { requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, route } from "@/server/http/handler";
import { revokeInvitation } from "@/server/services/team";

export const DELETE = route<{ id: string }>(async (_request, { id }) => {
  const context = await requireApiSession();
  if (!isUuid(id)) throw notFound("La invitación");
  await revokeInvitation(context, id);
  return ok({ revoked: true });
});
