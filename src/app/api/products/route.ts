import { requireApiSession } from "@/server/auth/session";
import { limitUser, ok, parseBody, parseQuery, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { createProduct, listProducts } from "@/server/services/products";
import { productListQuerySchema, productSchema } from "@/validation/schemas";

export const GET = route(async (request) => {
  const context = await requireApiSession();
  return ok(await listProducts(context, parseQuery(request, productListQuerySchema)));
});

export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.mutation, context.user.id);
  const input = await parseBody(request, productSchema);
  return ok(await createProduct(context, input), 201);
});
