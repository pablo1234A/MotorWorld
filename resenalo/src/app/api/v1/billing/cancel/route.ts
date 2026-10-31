import { z } from "zod";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { setCancelAtPeriodEnd } from "@/server/modules/billing/stripe";

export const POST = tenantRoute(async (req, { user, business }) => {
  const { cancel } = await readJson(req, z.object({ cancel: z.boolean() }));
  await setCancelAtPeriodEnd(business.id, cancel, user.id);
  return Response.json({ ok: true });
});
