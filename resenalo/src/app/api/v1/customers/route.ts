import { z } from "zod";
import { RequestStatus } from "@prisma/client";
import { tenantRoute } from "@/server/http/tenant";
import { readJson, searchParams, parseWith } from "@/server/http/request";
import { createCustomer, customerSchema, listCustomers } from "@/server/modules/customers";
import { getEntitlements } from "@/server/modules/billing/entitlements";

export const GET = tenantRoute(async (req, { business }) => {
  const sp = searchParams(req);
  const q = parseWith(
    z.object({
      search: z.string().max(100).optional(),
      status: z.nativeEnum(RequestStatus).optional(),
      tag: z.string().max(32).optional(),
      page: z.coerce.number().int().min(1).max(10000).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }),
    Object.fromEntries([...sp.entries()].filter(([, v]) => v !== "")),
  );
  return Response.json(await listCustomers(business.id, q));
});

export const POST = tenantRoute(async (req, { user, business }) => {
  const body = await readJson(req, customerSchema.extend({ requestReview: z.boolean().default(false), sendNow: z.boolean().default(false) }));
  const { requestReview, sendNow, ...input } = body;
  const ent = await getEntitlements(business.id);
  const result = await createCustomer(business.id, user.id, input, { requestReview, sendNow, tagsAllowed: Boolean(ent.features?.customerTags) }, req);
  return Response.json(result, { status: 201 });
});
