import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/server/http/errors";
import { ok, parseBody, route } from "@/server/http/handler";
import { checkRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { loginSchema } from "@/validation/schemas";

export const POST = route(
  async (request) => {
    const input = await parseBody(request, loginSchema);
    // Límite adicional por cuenta: frena ataques distribuidos contra un mismo correo.
    if (!(await checkRateLimit({ ...RATE_LIMITS.login, name: "login-email", max: 10 }, input.email))) {
      throw new ApiError("rate_limited", "Demasiados intentos de inicio de sesión. Espera unos minutos.");
    }
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error || !data.user) {
      if (error?.code === "email_not_confirmed") throw new ApiError("forbidden", "Confirma tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.");
      if (error?.code === "user_banned") throw new ApiError("forbidden", "Esta cuenta está desactivada. Contacta con soporte.");
      throw new ApiError("unauthorized", "Correo o contraseña incorrectos.");
    }
    const { data: profile } = await supabase.from("profiles").select("disabled_at").eq("id", data.user.id).maybeSingle();
    if (profile?.disabled_at) {
      await supabase.auth.signOut();
      throw new ApiError("forbidden", "Esta cuenta está desactivada. Contacta con soporte.");
    }
    return ok({ redirectTo: "/app" });
  },
  { rateLimit: RATE_LIMITS.login },
);
