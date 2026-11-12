import { isUuid } from "@/lib/utils";
import { requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, route } from "@/server/http/handler";
import { deleteProductImage } from "@/server/services/products";

export const DELETE = route<{ id: string; imageId: string }>(async (_request, { id, imageId }) => {
  const context = await requireApiSession();
  if (!isUuid(id) || !isUuid(imageId)) throw notFound("La imagen");
  await deleteProductImage(context, id, imageId);
  return ok({ deleted: true });
});
