import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clientIp } from "@/server/security/rate-limit";

const TYPES: EmailOtpType[] = ["email", "signup", "recovery", "email_change", "invite", "magiclink"];

/** Solo se permiten redirecciones internas (evita open redirects). */
function safeNext(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

/**
 * Destino de los enlaces de los correos (confirmación de registro, recuperación de
 * contraseña y cambio de correo). Canjea el token de un solo uso por una sesión.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const failure = new URL("/login?error=enlace", request.nextUrl.origin);

  if (!tokenHash || !type || !TYPES.includes(type) || tokenHash.length > 200) return NextResponse.redirect(failure);
  if (!(await checkRateLimit({ name: "auth-confirm", max: 20, windowSeconds: 300 }, clientIp(request)))) return NextResponse.redirect(failure);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) return NextResponse.redirect(failure);

  if (type === "recovery") {
    const cookieStore = await cookies();
    cookieStore.set("ap_recovery", data.user.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 900, path: "/" });
    return NextResponse.redirect(new URL("/restablecer", request.nextUrl.origin));
  }
  const fallback = type === "email_change" ? "/app/cuenta" : "/app?bienvenida=1";
  return NextResponse.redirect(new URL(safeNext(searchParams.get("next"), fallback), request.nextUrl.origin));
}
