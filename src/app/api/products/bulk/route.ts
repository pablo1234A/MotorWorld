import { requireApiSession } from "@/server/auth/session";
import { limitUser, ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { bulkUpdateProducts, deleteProducts, setArchived } from "@/server/services/products";
import { productBulkSchema } from "@/validation/schemas";

/** Operaciones en lote sobre productos del workspace de la sesión. */
export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.mutation, context.user.id);
  const input = await parseBody(request, productBulkSchema);
  switch (input.action) {
    case "archive":
      return ok({ affected: await setArchived(context, input.ids, true) });
    case "restore":
      return ok({ affected: await setArchived(context, input.ids, false) });
    case "delete":
      return ok({ affected: await deleteProducts(context, input.ids) });
    case "update":
      return ok({ affected: await bulkUpdateProducts(context, input.ids, input.fields) });
  }
});
