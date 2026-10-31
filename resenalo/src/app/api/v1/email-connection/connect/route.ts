import { z } from "zod";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { startOAuth } from "@/server/modules/email-connection";

export const POST = tenantRoute(async (req, { user, business }) => {
  await enforceRateLimit(`oauth-start:${business.id}`, 20, 3600);
  const { provider, returnTo } = await readJson(req, z.object({ provider: z.enum(["GOOGLE", "MICROSOFT"]), returnTo: z.enum(["onboarding", "app"]).default("app") }));
  const url = await startOAuth({ businessId: business.id, userId: user.id, provider, returnTo });
  return Response.json({ url });
});
