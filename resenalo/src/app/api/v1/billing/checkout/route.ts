import { z } from "zod";
import { PlanCode } from "@prisma/client";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { createCheckoutSession } from "@/server/modules/billing/stripe";

export const POST = tenantRoute(async (req, { user, business }) => {
  await enforceRateLimit(`checkout:${business.id}`, 20, 3600);
  // Solo se acepta el código del plan: el precio y el límite se resuelven en el servidor.
  const { plan, returnTo } = await readJson(req, z.object({ plan: z.nativeEnum(PlanCode), returnTo: z.enum(["onboarding", "billing"]).default("billing") }));
  return Response.json({ url: await createCheckoutSession({ businessId: business.id, ownerEmail: user.email, planCode: plan, returnTo }) });
});
