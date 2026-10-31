import { z } from "zod";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { importCustomersCsv } from "@/server/modules/customers";
import { getEntitlements } from "@/server/modules/billing/entitlements";

export const POST = tenantRoute(async (req, { user, business }) => {
  await enforceRateLimit(`import:${business.id}`, 10, 3600);
  const body = await readJson(
    req,
    z.object({
      csv: z.string().min(1).max(2_000_000),
      createRequests: z.boolean().default(false),
      legalBasisConfirmed: z.literal(true, { errorMap: () => ({ message: "Confirma que tienes base legal para contactar a estos clientes" }) }),
    }),
    2_100_000,
  );
  const ent = await getEntitlements(business.id);
  const report = await importCustomersCsv(business.id, user.id, body.csv, { createRequests: body.createRequests, tagsAllowed: Boolean(ent.features?.customerTags) }, req);
  return Response.json({ report });
});
