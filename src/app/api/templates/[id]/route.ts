import { isUuid } from "@/lib/utils";
import { requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, parseBody, route } from "@/server/http/handler";
import { deleteTemplate, updateTemplate } from "@/server/services/templates";
import { templateSchema } from "@/validation/schemas";

type Params = { id: string };

export const PATCH = route<Params>(async (request, { id }) => {
  const context = await requireApiSession();
  if (!isUuid(id)) throw notFound("La plantilla");
  const input = await parseBody(request, templateSchema);
  return ok(await updateTemplate(context, id, input));
});

export const DELETE = route<Params>(async (_request, { id }) => {
  const context = await requireApiSession();
  if (!isUuid(id)) throw notFound("La plantilla");
  await deleteTemplate(context, id);
  return ok({ deleted: true });
});
