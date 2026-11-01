import { tenantRoute } from "@/server/http/tenant";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { startReviewsOAuth } from "@/server/modules/reviews";

export const POST = tenantRoute(async (_req, { user, business }) => {
  await enforceRateLimit(`reviews-oauth:${business.id}`, 20, 3600);
  return Response.json({ url: await startReviewsOAuth(business.id, user.id) });
});
