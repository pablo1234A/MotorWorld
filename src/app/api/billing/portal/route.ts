import { requireApiSession } from "@/server/auth/session";
import { createPortalSession } from "@/server/billing/stripe";
import { limitUser, ok, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";

export const POST = route(async () => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.accountSensitive, context.user.id);
  return ok({ url: await createPortalSession(context) });
});
