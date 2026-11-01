import { tenantRoute } from "@/server/http/tenant";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { syncReviews } from "@/server/modules/reviews";
import { ProviderError } from "@/server/email/providers/types";
import { AppError } from "@/server/http/errors";

export const POST = tenantRoute(async (_req, { business }) => {
  await enforceRateLimit(`reviews-sync:${business.id}`, 6, 3600, "Ya has sincronizado varias veces. Inténtalo más tarde.");
  try {
    return Response.json(await syncReviews(business.id));
  } catch (e) {
    if (e instanceof ProviderError) throw new AppError("PROVIDER_ERROR", e.message);
    throw e;
  }
});
