import { z } from "zod";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { requireFeature } from "@/server/modules/billing/entitlements";
import { createApiKey } from "@/server/modules/integrations";

export const POST = tenantRoute(async (req, { user, business }) => {
  await requireFeature(business.id, "apiAccess", "La API");
  const { name } = await readJson(req, z.object({ name: z.string().trim().min(1).max(60) }));
  const { key, secret } = await createApiKey(business.id, user.id, name, req);
  return Response.json({ key: { id: key.id, name: key.name, prefix: key.prefix, createdAt: key.createdAt }, secret }, { status: 201 });
});
