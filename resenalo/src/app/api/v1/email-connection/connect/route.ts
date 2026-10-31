import { z } from "zod";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { startOAuth } from "@/server/modules/email-connection";

export const POST = tenantRoute(async (req, { user, business }) => {
  await enforceRateLimit(`oauth-start:${business.id}`, 20, 3600);
  const { provider } = await readJson(req, z.object({ provider: z.enum(["GOOGLE", "MICROSOFT"]) }));
  const url = await startOAuth({ businessId: business.id, userId: user.id, provider, loginHint: undefined });
  return Response.json({ url });
});
