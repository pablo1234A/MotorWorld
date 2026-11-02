import { z } from "zod";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { connectSmsDevice, publicSmsDevice } from "@/server/modules/sms-device";
import { requireFeature } from "@/server/modules/billing/entitlements";

export const POST = tenantRoute(async (req, { user, business }) => {
  await requireFeature(business.id, "sms", "El envío de SMS");
  await enforceRateLimit(`sms-connect:${business.id}`, 20, 3600);
  const b = await readJson(
    req,
    z.object({
      login: z.string().trim().min(1, "Indica el usuario de la app").max(100),
      password: z.string().trim().min(1, "Indica la contraseña de la app").max(200),
      apiBaseUrl: z.string().trim().max(300).optional().nullable(),
      phoneNumber: z.string().trim().max(30).optional().nullable(),
      deviceId: z.string().trim().max(100).optional().nullable(),
    }),
  );
  const r = await connectSmsDevice({ businessId: business.id, userId: user.id, ...b }, req);
  return Response.json({ device: publicSmsDevice(r.device), devices: r.devices });
});
