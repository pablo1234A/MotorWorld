import { tenantRoute } from "@/server/http/tenant";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { checkConnection } from "@/server/modules/email-connection";

export const POST = tenantRoute(async (_req, { business }) => {
  await enforceRateLimit(`oauth-check:${business.id}`, 20, 3600);
  return Response.json(await checkConnection(business.id));
});
