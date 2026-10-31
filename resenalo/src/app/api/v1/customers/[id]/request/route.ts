import { z } from "zod";
import { EventSource } from "@prisma/client";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { getCustomer } from "@/server/modules/customers";
import { createReviewRequest } from "@/server/modules/automation/requests";

/** Genera manualmente una solicitud de reseña para un cliente existente. */
export const POST = tenantRoute(async (req, { business }, { id }) => {
  await enforceRateLimit(`manual-request:${business.id}`, 60, 60);
  const body = await readJson(req, z.object({ sendNow: z.boolean().default(false), serviceName: z.string().trim().max(160).optional(), completedAt: z.coerce.date().optional() }));
  const customer = await getCustomer(business.id, id);
  const result = await createReviewRequest(business.id, {
    customerId: customer.id,
    source: EventSource.MANUAL,
    sendNow: body.sendNow,
    serviceName: body.serviceName ?? customer.serviceName,
    completedAt: body.completedAt ?? customer.completedAt ?? new Date(),
  });
  const status = result.status === "CREATED" ? 201 : result.reason === "LIMIT_REACHED" ? 402 : 200;
  return Response.json(result, { status });
});
