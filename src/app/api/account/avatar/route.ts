import { requireApiSession } from "@/server/auth/session";
import { ApiError } from "@/server/http/errors";
import { limitUser, ok, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { removeAvatar, updateAvatar } from "@/server/services/account";

export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.upload, context.user.id);
  const form = await request.formData().catch(() => {
    throw new ApiError("bad_request", "La petición debe ser multipart/form-data.");
  });
  return ok({ url: await updateAvatar(context, form.get("file")) });
});

export const DELETE = route(async () => {
  const context = await requireApiSession();
  await removeAvatar(context);
  return ok({ removed: true });
});
