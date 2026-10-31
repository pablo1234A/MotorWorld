import { tenantRoute } from "@/server/http/tenant";
import { createPortalSession } from "@/server/modules/billing/stripe";

export const POST = tenantRoute(async (_req, { business }) => Response.json({ url: await createPortalSession(business.id) }));
