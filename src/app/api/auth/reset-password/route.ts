import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/server/http/errors";
import { ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { resetPasswordSchema } from "@/validation/schemas";

const RECOVERY_COOKIE = "ap_recovery";

export const POST = route(
  async (request) => {
    const input = await parseBody(request, resetPasswordSchema);
    const cookieStore = await cookies();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Solo se acepta si la sesión procede de un enlace de recuperación verificado hace poco.
    if (!user || cookieStore.get(RECOVERY_COOKIE)?.value !== user.id) {
      throw new ApiError("forbidden", "El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.");
    }
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) {
      throw new ApiError("validation_error", error.code === "same_password" ? "La nueva contraseña debe ser distinta de la anterior." : "No se pudo actualizar la contraseña.");
    }
    cookieStore.delete(RECOVERY_COOKIE);
    await supabase.auth.signOut({ scope: "others" });
    return ok({ redirectTo: "/app" });
  },
  { rateLimit: RATE_LIMITS.passwordReset },
);
