import { requireApiSession } from "@/server/auth/session";
import { limitUser, ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { changePassword } from "@/server/services/account";
import { changePasswordSchema } from "@/validation/schemas";

export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.accountSensitive, context.user.id);
  const input = await parseBody(request, changePasswordSchema);
  await changePassword(context, input.currentPassword, input.password);
  return ok({ changed: true });
});
