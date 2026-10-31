import { route } from "@/server/http/handler";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { authenticateApiKey } from "@/server/modules/integrations";
import { inboundEventSchema, ingestEvent } from "@/server/modules/events-ingest";

/**
 * API pública: POST /api/public/v1/events
 * Authorization: Bearer rsn_live_…
 * Body: { externalId?, customer: { name, email, phone? }, serviceName?, completedAt?, metadata? }
 */
export const POST = route(
  async (req) => {
    const business = await authenticateApiKey(req);
    await enforceRateLimit(`api:${business.id}`, 120, 60);
    const ev = await readJson(req, inboundEventSchema, 32_000);
    const result = await ingestEvent(business, ev, "API");
    return Response.json(result, { status: result.status === "CREATED" ? 201 : 200 });
  },
  { csrf: false },
);
