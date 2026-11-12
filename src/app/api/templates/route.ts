import { requireApiSession } from "@/server/auth/session";
import { limitUser, ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { createTemplate, listTemplates } from "@/server/services/templates";
import { templateSchema } from "@/validation/schemas";

export const GET = route(async () => {
  const context = await requireApiSession();
  return ok(await listTemplates(context));
});

export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.mutation, context.user.id);
  const input = await parseBody(request, templateSchema);
  return ok(await createTemplate(context, input), 201);
});
