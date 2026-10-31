import { tenantRoute } from "@/server/http/tenant";
import { setDefaultTemplate } from "@/server/modules/templates";

export const POST = tenantRoute(async (_req, { business }, { id }) => {
  await setDefaultTemplate(business.id, id);
  return Response.json({ ok: true });
});
