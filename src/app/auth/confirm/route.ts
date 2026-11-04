import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/server/http/request";
import { logger } from "@/server/logger";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * Destino de los enlaces de los correos de Auth (verificación de email y
 * recuperación de contraseña). Usa `token_hash` + verifyOtp, que funciona
 * aunque el enlace se abra en otro dispositivo o navegador.
 * Plantillas: supabase/templates/*.html.
 */
const ALLOWED_TYPES: readonly EmailOtpType[] = ["signup", "email", "recovery", "email_change", "invite", "magiclink"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"), type === "recovery" ? "/cuenta/nueva-contrasena" : "/onboarding");

  const fail = (reason: string) => {
    const url = request.nextUrl.clone();
    url.pathname = "/acceso";
    url.search = `?error=${reason}`;
    return NextResponse.redirect(url);
  };

  if (!tokenHash || !type || !ALLOWED_TYPES.includes(type) || tokenHash.length > 200) {
    return fail("enlace_no_valido");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    logger.info("auth_confirm_failed", { type, code: error.code, status: error.status });
    // Supabase Auth no distingue un enlace caducado de uno inventado o ya usado.
    return fail("enlace_no_valido");
  }

  const url = request.nextUrl.clone();
  const [pathname, query] = next.split("?");
  url.pathname = pathname;
  url.search = query ? `?${query}` : "";
  return NextResponse.redirect(url);
}
