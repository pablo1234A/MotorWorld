import { tenantRoute } from "@/server/http/tenant";
import { listLocations } from "@/server/modules/reviews";
import { ProviderError } from "@/server/email/providers/types";
import { AppError } from "@/server/http/errors";

export const GET = tenantRoute(async (_req, { business }) => {
  try {
    return Response.json({ locations: await listLocations(business.id) });
  } catch (e) {
    if (e instanceof ProviderError) throw new AppError("PROVIDER_ERROR", e.message);
    throw e;
  }
});
