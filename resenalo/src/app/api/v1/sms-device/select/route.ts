import { z } from "zod";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { selectSmsDevice } from "@/server/modules/sms-device";

export const POST = tenantRoute(async (req, { business }) => {
  const { deviceId } = await readJson(req, z.object({ deviceId: z.string().trim().min(1).max(100) }));
  await selectSmsDevice(business.id, deviceId);
  return Response.json({ ok: true });
});
