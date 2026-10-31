import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { createRule, listRules, ruleSchema } from "@/server/modules/automation/rules";

export const GET = tenantRoute(async (_req, { business }) => Response.json({ rules: await listRules(business.id), paused: business.automationPaused }));
export const POST = tenantRoute(async (req, { user, business }) => {
  const body = await readJson(req, ruleSchema);
  return Response.json({ rule: await createRule(business.id, user.id, body, req) }, { status: 201 });
});
