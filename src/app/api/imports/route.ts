import { requireApiSession } from "@/server/auth/session";
import { ApiError } from "@/server/http/errors";
import { limitUser, ok, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { analyzeImport } from "@/server/services/jobs";

/** Paso 1 de la importación: sube el CSV y devuelve columnas, mapeo sugerido y vista previa. */
export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.upload, context.user.id);
  const form = await request.formData().catch(() => {
    throw new ApiError("bad_request", "La petición debe ser multipart/form-data.");
  });
  return ok(await analyzeImport(context, form.get("file")), 201);
});
