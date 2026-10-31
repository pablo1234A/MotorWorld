import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { customerSchema, deleteCustomer, getCustomer, updateCustomer } from "@/server/modules/customers";
import { getEntitlements } from "@/server/modules/billing/entitlements";

export const GET = tenantRoute(async (_req, { business }, { id }) => Response.json({ customer: await getCustomer(business.id, id) }));

export const PATCH = tenantRoute(async (req, { user, business }, { id }) => {
  const body = await readJson(req, customerSchema.partial());
  const ent = await getEntitlements(business.id);
  return Response.json({ customer: await updateCustomer(business.id, user.id, id, body, Boolean(ent.features?.customerTags), req) });
});

export const DELETE = tenantRoute(async (req, { user, business }, { id }) => {
  await deleteCustomer(business.id, user.id, id, req);
  return Response.json({ ok: true });
});
