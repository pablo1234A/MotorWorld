import { isUuid } from "@/lib/utils";
import { requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { limitUser, ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { adaptExistingListing } from "@/server/services/listings";
import { listingAdaptSchema } from "@/validation/schemas";

/** Cambia la plataforma o plantilla de un anuncio adaptando su contenido actual. */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.mutation, context.user.id);
  if (!isUuid(id)) throw notFound("El anuncio");
  const input = await parseBody(request, listingAdaptSchema);
  return ok(await adaptExistingListing(context, id, input.platform, input.templateId));
});
