import { tenantRoute } from "@/server/http/tenant";
import { getEntitlements } from "@/server/modules/billing/entitlements";

/** Funciones disponibles según el plan (solo informativo para la UI; el backend las vuelve a comprobar). */
export const GET = tenantRoute(async (_req, { business }) => {
  const e = await getEntitlements(business.id);
  return Response.json({
    planCode: e.plan?.code ?? null,
    canSend: e.canSend,
    features: e.features ?? {},
    maxTemplates: e.plan ? e.plan.maxTemplates : 1,
    maxAutomationRules: e.plan?.maxAutomationRules ?? 1,
  });
});
