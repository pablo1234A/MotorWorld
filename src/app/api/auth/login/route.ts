import { z } from "zod";
import { authenticate, AuthError, createSession } from "@/server/auth";
import { assertSameOrigin, clientIp, handler, HttpError, json, parseBody, rateLimit } from "@/server/http";

const body = z.object({ email: z.string().trim().max(200), password: z.string().max(200) });

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const data = await parseBody(req, body);
  rateLimit(`login:${clientIp(req)}`, 20, 15 * 60_000);
  rateLimit(`login:${data.email.toLowerCase()}`, 8, 15 * 60_000);
  try {
    const user = await authenticate(data.email, data.password);
    await createSession(user.id);
    return json({ user });
  } catch (e) {
    if (e instanceof AuthError) throw new HttpError(401, e.message);
    throw e;
  }
});
