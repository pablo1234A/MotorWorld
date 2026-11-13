import { cookies } from "next/headers";
import { isUuid } from "@/lib/utils";
import { WORKSPACE_COOKIE, requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, parseBody, route } from "@/server/http/handler";
import { acceptInvitation, declineInvitation } from "@/server/services/team";
import { invitationActionSchema } from "@/validation/schemas";

export const POST = route<{ token: string }>(async (request, { token }) => {
  const context = await requireApiSession();
  if (!isUuid(token)) throw notFound("La invitación");
  const { action } = await parseBody(request, invitationActionSchema);
  if (action === "decline") {
    await declineInvitation(context, token);
    return ok({ declined: true });
  }
  const workspaceId = await acceptInvitation(context, token);
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return ok({ workspaceId });
});
