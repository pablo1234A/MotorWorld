import { env } from "@/server/env";
import { getAuthFromRequest } from "@/server/auth/session";
import { completeOAuth } from "@/server/modules/email-connection";
import { AppError } from "@/server/http/errors";
import { ProviderError } from "@/server/email/providers/types";
import { reportError } from "@/server/logger";

/** Callback OAuth: el proveedor redirige aquí tras la autorización del usuario. */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(`${env().APP_URL}/app/conexion-correo?${q}`, 303);
  const p = provider === "google" ? "GOOGLE" : provider === "microsoft" ? "MICROSOFT" : null;
  if (!p) return back("error=" + encodeURIComponent("Proveedor no válido"));
  const auth = await getAuthFromRequest(req);
  if (!auth) return Response.redirect(`${env().APP_URL}/login?next=/app/conexion-correo`, 303);
  const err = url.searchParams.get("error");
  if (err) return back("error=" + encodeURIComponent(err === "access_denied" ? "Has cancelado la autorización." : `El proveedor devolvió un error: ${err}`));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("error=" + encodeURIComponent("Respuesta OAuth incompleta"));
  try {
    await completeOAuth({ provider: p, code, state, userId: auth.user.id }, req);
    return back("connected=1");
  } catch (e) {
    if (!(e instanceof AppError) && !(e instanceof ProviderError)) void reportError(e, { where: "oauth-callback" });
    const msg = e instanceof AppError || e instanceof ProviderError ? e.message : "No se pudo completar la conexión.";
    return back("error=" + encodeURIComponent(msg));
  }
}
