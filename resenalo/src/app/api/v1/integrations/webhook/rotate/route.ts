import { tenantRoute } from "@/server/http/tenant";
import { requireFeature } from "@/server/modules/billing/entitlements";
import { rotateInboundWebhookSecret } from "@/server/modules/integrations";

export const POST = tenantRoute(async (req, { user, business }) => {
  await requireFeature(business.id, "apiAccess", "Los webhooks");
  return Response.json({ secret: await rotateInboundWebhookSecret(business.id, user.id, req) });
});
