import { requireApiSession } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";
import { signOutOtherSessions } from "@/server/services/account";

/** Cierra todas las sesiones del usuario excepto la actual. */
export const DELETE = route(async () => {
  const context = await requireApiSession();
  await signOutOtherSessions(context);
  return ok({ signedOut: true });
});
