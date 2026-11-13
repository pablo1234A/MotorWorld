import { requireApiSession } from "@/server/auth/session";
import { limitUser, ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { getTeam, inviteMember } from "@/server/services/team";
import { inviteMemberSchema } from "@/validation/schemas";

export const GET = route(async () => ok(await getTeam(await requireApiSession())));

export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.accountSensitive, context.user.id);
  const input = await parseBody(request, inviteMemberSchema);
  return ok(await inviteMember(context, input.email, input.role), 201);
});
