import { tenantRoute } from "@/server/http/tenant";
import { revokeApiKey } from "@/server/modules/integrations";

export const DELETE = tenantRoute(async (req, { user, business }, { id }) => {
  await revokeApiKey(business.id, user.id, id, req);
  return Response.json({ ok: true });
});
