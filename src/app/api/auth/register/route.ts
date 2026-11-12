import { appUrl } from "@/lib/config/env";
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/server/http/errors";
import { ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { registerSchema } from "@/validation/schemas";

export const POST = route(
  async (request) => {
    const input = await parseBody(request, registerSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.fullName }, emailRedirectTo: appUrl("/auth/confirm") },
    });
    if (error) {
      if (error.code === "weak_password") throw new ApiError("validation_error", "La contraseña es demasiado débil.", { fields: { password: "Elige una contraseña más segura." } });
      if (error.code === "over_email_send_rate_limit" || error.status === 429) throw new ApiError("rate_limited", "Se han enviado demasiados correos. Espera unos minutos.");
      if (error.code === "signup_disabled") throw new ApiError("forbidden", "El registro está cerrado temporalmente.");
      throw new ApiError("bad_request", "No se pudo completar el registro. Revisa los datos e inténtalo de nuevo.");
    }
    // Respuesta idéntica exista o no el correo: evita la enumeración de cuentas.
    return ok({ requiresEmailConfirmation: !data.session }, 201);
  },
  { rateLimit: RATE_LIMITS.register },
);
