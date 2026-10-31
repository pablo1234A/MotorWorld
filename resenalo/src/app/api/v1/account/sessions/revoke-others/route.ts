import { userRoute } from "@/server/http/tenant";
import { destroyAllSessions } from "@/server/auth/session";
import { audit } from "@/server/modules/audit";

export const POST = userRoute(async (req, { user, session }) => {
  await destroyAllSessions(user.id, session.id);
  await audit({ action: "auth.sessions_revoked_others", userId: user.id, req });
  return Response.json({ ok: true });
});
