import { requireApiSession } from "@/server/auth/session";
import { limitUser, ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { validateImport } from "@/server/services/jobs";
import { importValidateSchema } from "@/validation/schemas";

/** Paso 2: valida todas las filas con el mapeo elegido. */
export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.mutation, context.user.id);
  const input = await parseBody(request, importValidateSchema);
  return ok(await validateImport(context, input));
});
