import { isUuid } from "@/lib/utils";
import { assertCanEdit, requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, route } from "@/server/http/handler";
import { deleteCustomCategory } from "@/server/services/catalog";

export const DELETE = route<{ id: string }>(async (_request, { id }) => {
  const context = await requireApiSession();
  assertCanEdit(context);
  if (!isUuid(id)) throw notFound("La categoría");
  await deleteCustomCategory(context, id);
  return ok({ deleted: true });
});
