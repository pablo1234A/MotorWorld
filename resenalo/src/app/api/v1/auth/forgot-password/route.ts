import { z } from "zod";
import { route } from "@/server/http/handler";
import { readJson, clientIp } from "@/server/http/request";
import { enforceRateLimit, rateLimit } from "@/server/http/rate-limit";
import { normalizeEmail, requestPasswordReset } from "@/server/auth/service";

export const POST = route(async (req) => {
  await enforceRateLimit(`forgot:ip:${clientIp(req)}`, 10, 3600);
  const { email } = await readJson(req, z.object({ email: z.string().trim().email("Correo no válido").max(254) }));
  const perEmail = await rateLimit(`forgot:email:${normalizeEmail(email)}`, 3, 3600);
  // Misma respuesta siempre: no revela si la cuenta existe.
  if (perEmail.ok) await requestPasswordReset(email, req);
  return Response.json({ ok: true });
});
