import { tenantRoute } from "@/server/http/tenant";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { checkSmsDevice } from "@/server/modules/sms-device";

export const POST = tenantRoute(async (_req, { business }) => {
  await enforceRateLimit(`sms-check:${business.id}`, 30, 3600);
  return Response.json(await checkSmsDevice(business.id));
});
