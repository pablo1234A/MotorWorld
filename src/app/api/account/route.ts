import { requireApiSession } from "@/server/auth/session";
import { limitUser, ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { deleteAccount, updateProfile } from "@/server/services/account";
import { deleteAccountSchema, profileSchema } from "@/validation/schemas";

export const PATCH = route(async (request) => {
  const context = await requireApiSession();
  const input = await parseBody(request, profileSchema);
  await updateProfile(context, input.fullName);
  return ok({ fullName: input.fullName });
});

export const DELETE = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.accountSensitive, context.user.id);
  const input = await parseBody(request, deleteAccountSchema);
  await deleteAccount(context, input.password);
  return ok({ redirectTo: "/?cuenta=eliminada" });
});
