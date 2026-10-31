import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { createTemplate, listTemplates, templateSchema } from "@/server/modules/templates";

export const GET = tenantRoute(async (_req, { business }) => Response.json({ templates: await listTemplates(business.id) }));
export const POST = tenantRoute(async (req, { user, business }) => {
  const body = await readJson(req, templateSchema);
  return Response.json({ template: await createTemplate(business.id, user.id, body, req) }, { status: 201 });
});
