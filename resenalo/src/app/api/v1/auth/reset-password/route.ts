import { z } from "zod";
import { route } from "@/server/http/handler";
import { readJson, clientIp } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { resetPassword } from "@/server/auth/service";
import { clearSessionCookie } from "@/server/auth/session";

export const POST = route(async (req) => {
  await enforceRateLimit(`reset:${clientIp(req)}`, 20, 3600);
  const { token, password } = await readJson(req, z.object({ token: z.string().min(10).max(100), password: z.string().min(1).max(128) }));
  await resetPassword(token, password, req);
  return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
});
