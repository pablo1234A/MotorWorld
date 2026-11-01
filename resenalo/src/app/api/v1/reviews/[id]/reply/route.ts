import { z } from "zod";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { requireFeature } from "@/server/modules/billing/entitlements";
import { replyToReview } from "@/server/modules/reviews";
import { ProviderError } from "@/server/email/providers/types";
import { AppError } from "@/server/http/errors";

export const POST = tenantRoute(async (req, { user, business }, { id }) => {
  await requireFeature(business.id, "reviewReplies", "Responder reseñas");
  await enforceRateLimit(`reviews-reply:${business.id}`, 60, 3600);
  const { comment } = await readJson(req, z.object({ comment: z.string().trim().min(2, "Escribe una respuesta").max(4000) }));
  try {
    return Response.json({ review: await replyToReview(business.id, user.id, id, comment, req) });
  } catch (e) {
    if (e instanceof ProviderError) throw new AppError("PROVIDER_ERROR", e.message);
    throw e;
  }
});
