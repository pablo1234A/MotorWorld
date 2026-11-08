import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getOrgContext } from "@/server/auth/context";
import { DomainError } from "@/server/db/errors";
import { logger } from "@/server/logger";
import { completeConnect } from "@/server/modules/integrations/calendar";

const STATE_COOKIE = "ry_google_state";

/**
 * Vuelta de la pantalla de permisos de Google (OAuth 2.0). Comprueba el state
 * firmado contra la cookie y la sesión, guarda los tokens cifrados y vuelve a
 * Configuración → Integraciones con el resultado. Nunca muestra el código ni
 * los tokens.
 */
export async function GET(request: Request) {
  const appUrl = process.env.APP_URL ?? new URL(request.url).origin;
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/app/configuracion/integraciones?google=${result}`, appUrl), 303);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/integrations/google", maxAge: 0 });
    return res;
  };
  const url = new URL(request.url);
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(new URL("/acceso?next=/app/configuracion/integraciones", appUrl), 303);
  if (url.searchParams.get("error")) return back("cancelado");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("error");
  try {
    await completeConnect(ctx, { code, state, cookieState: (await cookies()).get(STATE_COOKIE)?.value }, appUrl);
    return back("conectado");
  } catch (err) {
    if (err instanceof DomainError) {
      if (err.detail === "google_scope") return back("permisos");
      if (err.detail === "oauth_state") return back("caducado");
      if (err.code === "permission_denied") return back("sin_permiso");
      if (err.code === "feature_unavailable" || err.code === "subscription_inactive") return back("plan");
      if (err.code === "integration_not_configured") return back("no_configurado");
    } else {
      logger.error("google_callback_failed", { error: err });
    }
    return back("error");
  }
}
