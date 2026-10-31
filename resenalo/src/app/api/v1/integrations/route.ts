import { env } from "@/server/env";
import { tenantRoute } from "@/server/http/tenant";
import { getEntitlements } from "@/server/modules/billing/entitlements";
import { getOrCreateInboundWebhook, listApiKeys } from "@/server/modules/integrations";

export const GET = tenantRoute(async (_req, { business }) => {
  const ent = await getEntitlements(business.id);
  if (!ent.features?.apiAccess) return Response.json({ available: false });
  const hook = await getOrCreateInboundWebhook(business.id);
  return Response.json({
    available: true,
    apiKeys: await listApiKeys(business.id),
    apiEndpoint: `${env().APP_URL}/api/public/v1/events`,
    webhook: { url: `${env().APP_URL}/api/hooks/${hook.publicId}`, secret: hook.secret },
  });
});
