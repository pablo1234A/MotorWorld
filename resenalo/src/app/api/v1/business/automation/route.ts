import { z } from "zod";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { setAutomationPaused } from "@/server/modules/business";

export const POST = tenantRoute(async (req, { user, business }) => {
  const { paused } = await readJson(req, z.object({ paused: z.boolean() }));
  await setAutomationPaused(business.id, user.id, paused, req);
  return Response.json({ paused });
});
