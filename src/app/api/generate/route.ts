import { requireApiSession } from "@/server/auth/session";
import { limitUser, ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { generateForProduct } from "@/server/services/generation";
import { generateSchema } from "@/validation/schemas";

export const maxDuration = 60;

export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.generate, context.user.id);
  const input = await parseBody(request, generateSchema);
  return ok(await generateForProduct(context, input));
});
