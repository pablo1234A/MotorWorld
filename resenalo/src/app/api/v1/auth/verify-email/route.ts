import { z } from "zod";
import { route } from "@/server/http/handler";
import { readJson, clientIp } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { verifyEmail } from "@/server/auth/service";

export const POST = route(async (req) => {
  await enforceRateLimit(`verify:${clientIp(req)}`, 30, 3600);
  const { token } = await readJson(req, z.object({ token: z.string().min(10).max(100) }));
  await verifyEmail(token);
  return Response.json({ ok: true });
});
