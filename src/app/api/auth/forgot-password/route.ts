import { appUrl } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { forgotPasswordSchema } from "@/validation/schemas";

export const POST = route(
  async (request) => {
    const { email } = await parseBody(request, forgotPasswordSchema);
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl("/auth/confirm") });
    if (error) logger.warn("auth.reset_email_failed", { code: error.code });
    // Siempre la misma respuesta: no se revela si el correo está registrado.
    return ok({ sent: true });
  },
  { rateLimit: RATE_LIMITS.passwordReset },
);
