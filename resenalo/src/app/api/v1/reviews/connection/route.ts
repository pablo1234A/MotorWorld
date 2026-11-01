import { tenantRoute } from "@/server/http/tenant";
import { disconnectReviews } from "@/server/modules/reviews";

export const DELETE = tenantRoute(async (req, { user, business }) => {
  await disconnectReviews(business.id, user.id, req);
  return Response.json({ ok: true });
});
