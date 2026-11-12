import { isUuid } from "@/lib/utils";
import { requireApiSession } from "@/server/auth/session";
import { ApiError, notFound } from "@/server/http/errors";
import { limitUser, ok, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { addProductImage } from "@/server/services/products";

export const POST = route<{ id: string }>(async (request, { id }) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.upload, context.user.id);
  if (!isUuid(id)) throw notFound("El producto");
  const form = await request.formData().catch(() => {
    throw new ApiError("bad_request", "La petición debe ser multipart/form-data.");
  });
  return ok(await addProductImage(context, id, form.get("file")), 201);
});
