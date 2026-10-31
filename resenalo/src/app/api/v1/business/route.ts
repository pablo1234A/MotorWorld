import { z } from "zod";
import { route } from "@/server/http/handler";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { requireUser } from "@/server/auth/context";
import { businessSchema, createBusiness, updateBusiness } from "@/server/modules/business";

export const GET = tenantRoute(async (_req, { business }) => Response.json({ business }));

export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson(req, businessSchema.extend({ acceptDpa: z.boolean() }));
  const business = await createBusiness(user.id, body, req);
  return Response.json({ business }, { status: 201 });
});

export const PATCH = tenantRoute(async (req, { user, business }) => {
  const body = await readJson(req, businessSchema.partial());
  const updated = await updateBusiness(business.id, user.id, body, req);
  return Response.json({ business: updated });
});
