import { isUuid } from "@/lib/utils";
import { requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { limitUser, ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { deleteProducts, getProduct, updateProduct } from "@/server/services/products";
import { productSchema } from "@/validation/schemas";

type Params = { id: string };
const checked = (id: string) => {
  if (!isUuid(id)) throw notFound("El producto");
  return id;
};

export const GET = route<Params>(async (_request, { id }) => {
  const context = await requireApiSession();
  return ok(await getProduct(context, checked(id)));
});

export const PATCH = route<Params>(async (request, { id }) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.mutation, context.user.id);
  const input = await parseBody(request, productSchema);
  return ok(await updateProduct(context, checked(id), input));
});

export const DELETE = route<Params>(async (_request, { id }) => {
  const context = await requireApiSession();
  const deleted = await deleteProducts(context, [checked(id)]);
  if (deleted === 0) throw notFound("El producto");
  return ok({ deleted });
});
