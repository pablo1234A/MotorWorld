import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { campaignSchema, launchCampaign, listCampaigns } from "@/server/modules/campaigns";

export const GET = tenantRoute(async (_req, { business }) => Response.json({ campaigns: await listCampaigns(business.id) }));
export const POST = tenantRoute(async (req, { user, business }) => {
  await enforceRateLimit(`campaign:${business.id}`, 10, 3600);
  const body = await readJson(req, campaignSchema);
  return Response.json(await launchCampaign(business.id, user.id, body, req), { status: 201 });
});
