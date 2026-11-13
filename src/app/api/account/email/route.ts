import { requireApiSession } from "@/server/auth/session";
import { limitUser, ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { changeEmail } from "@/server/services/account";
import { changeEmailSchema } from "@/validation/schemas";

export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.accountSensitive, context.user.id);
  const input = await parseBody(request, changeEmailSchema);
  await changeEmail(context, input.email, input.password);
  return ok({ confirmationSent: true });
});
