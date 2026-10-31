import { z } from "zod";
import { userRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { changePassword } from "@/server/auth/service";

export const POST = userRoute(async (req, { user, session }) => {
  await enforceRateLimit(`chpw:${user.id}`, 10, 3600);
  const b = await readJson(req, z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(1).max(128) }));
  await changePassword(user.id, session.id, b.currentPassword, b.newPassword, req);
  return Response.json({ ok: true });
});
