import { tenantRoute } from "@/server/http/tenant";
import { cancelJob } from "@/server/modules/automation/requests";

export const POST = tenantRoute(async (_req, { business }, { id }) => {
  await cancelJob(business.id, id);
  return Response.json({ ok: true });
});
