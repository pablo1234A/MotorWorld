import { createClient } from "@/lib/supabase/server";
import { fromDbError, ok, parseBody, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { contactSchema } from "@/validation/schemas";

export const POST = route(
  async (request) => {
    const input = await parseBody(request, contactSchema);
    const supabase = await createClient();
    const { error } = await supabase.rpc("submit_contact_message", {
      p_name: input.name,
      p_email: input.email,
      p_subject: input.subject,
      p_message: input.message,
    });
    if (error) throw fromDbError(error, "No se pudo enviar el mensaje.");
    return ok({ sent: true }, 201);
  },
  { rateLimit: RATE_LIMITS.contact },
);
