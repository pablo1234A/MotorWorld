import { z } from "zod";
import { userRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { deleteAccount } from "@/server/modules/account";
import { clearSessionCookie } from "@/server/auth/session";

export const POST = userRoute(
  async (req, { user }) => {
    await enforceRateLimit(`delete:${user.id}`, 5, 3600);
    const b = await readJson(req, z.object({ password: z.string().min(1).max(128), confirm: z.literal("ELIMINAR", { errorMap: () => ({ message: "Escribe ELIMINAR para confirmar" }) }) }));
    await deleteAccount(user.id, b.password, req);
    return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
  },
  { verified: false },
);
