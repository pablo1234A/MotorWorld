import { tenantRoute } from "@/server/http/tenant";
import { completeOnboarding } from "@/server/modules/business";

export const POST = tenantRoute(async (_req, { business }) => {
  await completeOnboarding(business.id);
  return Response.json({ ok: true });
});
