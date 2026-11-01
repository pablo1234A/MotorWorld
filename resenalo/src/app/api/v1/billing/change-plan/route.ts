import { z } from "zod";
import { PlanCode } from "@prisma/client";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { changePlan } from "@/server/modules/billing/stripe";

export const POST = tenantRoute(async (req, { user, business }) => {
  await enforceRateLimit(`change-plan:${business.id}`, 10, 3600);
  const { plan, interval } = await readJson(req, z.object({ plan: z.nativeEnum(PlanCode), interval: z.enum(["month", "year"]).optional() }));
  await changePlan(business.id, plan, user.id, interval);
  return Response.json({ ok: true });
});
