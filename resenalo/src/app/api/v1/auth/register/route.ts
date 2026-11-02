import { z } from "zod";
import { route } from "@/server/http/handler";
import { readJson, clientIp } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { register } from "@/server/auth/service";
import { normalizePhone } from "@/lib/phone";

const schema = z.object({
  name: z.string().trim().min(2, "Indica tu nombre").max(100),
  email: z.string().trim().toLowerCase().email("Correo no válido").max(254),
  password: z.string().min(1, "Indica una contraseña").max(128),
  phone: z
    .string()
    .trim()
    .min(1, "Indica tu teléfono")
    .max(30)
    .transform((v, ctx) => {
      const n = normalizePhone(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "Teléfono no válido (ej. +34 600 000 000)" });
        return z.NEVER;
      }
      return n;
    }),
  acceptTerms: z.literal(true, { error: "Debes aceptar las condiciones y la política de privacidad" }),
});

export const POST = route(async (req) => {
  await enforceRateLimit(`register:${clientIp(req)}`, 10, 3600);
  const body = await readJson(req, schema);
  const { user, cookie } = await register(body, req);
  return Response.json({ user: { id: user.id, email: user.email, name: user.name, phone: user.phone, emailVerified: false } }, { status: 201, headers: { "set-cookie": cookie } });
});
