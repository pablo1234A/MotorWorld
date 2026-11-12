import { requireApiSession } from "@/server/auth/session";
import { limitUser, ok, parseBody, parseQuery, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { createListing, listListings } from "@/server/services/listings";
import { listingCreateSchema, listingListQuerySchema } from "@/validation/schemas";

export const GET = route(async (request) => {
  const context = await requireApiSession();
  return ok(await listListings(context, parseQuery(request, listingListQuerySchema)));
});

export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.mutation, context.user.id);
  const input = await parseBody(request, listingCreateSchema);
  return ok(await createListing(context, input), 201);
});
