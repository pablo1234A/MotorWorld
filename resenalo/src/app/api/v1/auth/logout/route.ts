import { route } from "@/server/http/handler";
import { getAuthFromRequest, destroySession, clearSessionCookie } from "@/server/auth/session";
import { audit } from "@/server/modules/audit";

export const POST = route(async (req) => {
  const auth = await getAuthFromRequest(req);
  if (auth) {
    await destroySession(auth.session.id);
    await audit({ action: "auth.logout", userId: auth.user.id, req });
  }
  return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
});
