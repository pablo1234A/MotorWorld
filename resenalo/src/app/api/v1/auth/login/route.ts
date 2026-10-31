import { z } from "zod";
import { route } from "@/server/http/handler";
import { readJson, clientIp } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { login, normalizeEmail } from "@/server/auth/service";

const schema = z.object({ email: z.string().trim().email("Correo no válido").max(254), password: z.string().min(1).max(128) });

export const POST = route(async (req) => {
  const body = await readJson(req, schema);
  await enforceRateLimit(`login:ip:${clientIp(req)}`, 30, 900, "Demasiados intentos de inicio de sesión. Espera unos minutos.");
  await enforceRateLimit(`login:email:${normalizeEmail(body.email)}`, 10, 900, "Demasiados intentos para esta cuenta. Espera unos minutos.");
  const { user, cookie } = await login(body, req);
  return Response.json({ user: { id: user.id, email: user.email, name: user.name, emailVerified: Boolean(user.emailVerifiedAt) } }, { headers: { "set-cookie": cookie } });
});
