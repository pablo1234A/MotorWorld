import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { deleteRule, ruleSchema, updateRule } from "@/server/modules/automation/rules";

export const PUT = tenantRoute(async (req, { user, business }, { id }) => {
  const body = await readJson(req, ruleSchema);
  return Response.json({ rule: await updateRule(business.id, user.id, id, body, req) });
});
export const DELETE = tenantRoute(async (req, { user, business }, { id }) => {
  await deleteRule(business.id, user.id, id, req);
  return Response.json({ ok: true });
});
