import { requireApiSession, assertCanEdit } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { createCustomCategory, loadCategoryCatalog } from "@/server/services/catalog";
import { customCategorySchema } from "@/validation/schemas";

export const GET = route(async () => {
  const context = await requireApiSession();
  return ok(await loadCategoryCatalog(context.supabase));
});

export const POST = route(async (request) => {
  const context = await requireApiSession();
  assertCanEdit(context);
  const input = await parseBody(request, customCategorySchema);
  return ok(await createCustomCategory(context, input), 201);
});
