import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { deleteTemplate, getTemplate, templateSchema, updateTemplate } from "@/server/modules/templates";

export const GET = tenantRoute(async (_req, { business }, { id }) => Response.json({ template: await getTemplate(business.id, id) }));
export const PUT = tenantRoute(async (req, { user, business }, { id }) => {
  const body = await readJson(req, templateSchema);
  return Response.json({ template: await updateTemplate(business.id, user.id, id, body, req) });
});
export const DELETE = tenantRoute(async (req, { user, business }, { id }) => {
  await deleteTemplate(business.id, user.id, id, req);
  return Response.json({ ok: true });
});
