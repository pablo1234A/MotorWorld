import { requireApiSession } from "@/server/auth/session";
import { createCheckoutSession } from "@/server/billing/stripe";
import { limitUser, ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { checkoutSchema } from "@/validation/schemas";

/** Devuelve 503 (payments_disabled) mientras PAYMENTS_ENABLED=false. */
export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.accountSensitive, context.user.id);
  const input = await parseBody(request, checkoutSchema);
  return ok({ url: await createCheckoutSession(context, input.plan) });
});
