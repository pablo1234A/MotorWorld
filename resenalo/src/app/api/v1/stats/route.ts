import { z } from "zod";
import { tenantRoute } from "@/server/http/tenant";
import { parseWith, searchParams } from "@/server/http/request";
import { getStats } from "@/server/modules/stats";

export const GET = tenantRoute(async (req, { business }) => {
  const { days } = parseWith(z.object({ days: z.coerce.number().int().min(7).max(365).optional() }), Object.fromEntries(searchParams(req)));
  return Response.json(await getStats(business.id, { days }));
});
