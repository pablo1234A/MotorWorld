import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSessionClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { sendEmail } from "@/lib/email/send";
import { audit } from "@/lib/observability";

/**
 * Verificación de enlaces de email de Supabase (alta, recuperación, cambio de email).
 * Admite tanto `token_hash` (plantillas recomendadas) como `code` (PKCE).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const supabase = await createSessionClient();

  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) {
    return NextResponse.redirect(new URL("/acceder?error=enlace", request.url));
  }

  const { data } = await supabase.auth.getUser();
  if (data.user && (type === "signup" || type === "email" || (!type && next === "/panel"))) {
    await audit({ actorId: data.user.id, action: "auth.email_verified" });
    await sendEmail({
      key: `welcome:${data.user.id}`,
      to: data.user.email!,
      email: { template: "welcome", data: { name: (data.user.user_metadata?.full_name as string | undefined) ?? null } },
      userId: data.user.id,
    });
  }
  return NextResponse.redirect(new URL(next, request.url));
}
