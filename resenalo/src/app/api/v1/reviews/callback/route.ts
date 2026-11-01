import { env } from "@/server/env";
import { getAuthFromRequest } from "@/server/auth/session";
import { completeReviewsOAuth } from "@/server/modules/reviews";
import { AppError } from "@/server/http/errors";
import { ProviderError } from "@/server/email/providers/types";
import { reportError } from "@/server/logger";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(`${env().APP_URL}/app/resenas?${q}`, 303);
  const auth = await getAuthFromRequest(req);
  if (!auth) return Response.redirect(`${env().APP_URL}/login?next=/app/resenas`, 303);
  const err = url.searchParams.get("error");
  if (err) return back("error=" + encodeURIComponent(err === "access_denied" ? "Has cancelado la autorización." : `Google devolvió un error: ${err}`));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("error=" + encodeURIComponent("Respuesta OAuth incompleta"));
  try {
    await completeReviewsOAuth({ code, state, userId: auth.user.id }, req);
    return back("connected=1");
  } catch (e) {
    if (!(e instanceof AppError) && !(e instanceof ProviderError)) void reportError(e, { where: "reviews-oauth-callback" });
    return back("error=" + encodeURIComponent(e instanceof AppError || e instanceof ProviderError ? e.message : "No se pudo conectar la ficha de Google."));
  }
}
