import { z } from "zod";
import { AuthError, createSession, registerUser } from "@/server/auth";
import { assertSameOrigin, clientIp, handler, HttpError, json, parseBody, rateLimit } from "@/server/http";

const body = z.object({
  name: z.string().trim().min(1, "Escribe tu nombre").max(80),
  email: z.string().trim().email("Email no válido").max(200),
  password: z.string().min(8, "La contraseña necesita al menos 8 caracteres").max(200),
});

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  rateLimit(`register:${clientIp(req)}`, 10, 60 * 60_000);
  const data = await parseBody(req, body);
  try {
    const user = await registerUser(data.email, data.name, data.password);
    await createSession(user.id);
    return json({ user }, 201);
  } catch (e) {
    if (e instanceof AuthError) throw new HttpError(409, e.message);
    throw e;
  }
});
