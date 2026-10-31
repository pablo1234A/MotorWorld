import { route } from "@/server/http/handler";
import { getAuthFromRequest } from "@/server/auth/session";
import { getBusinessForUser } from "@/server/auth/context";

export const GET = route(async (req) => {
  const auth = await getAuthFromRequest(req);
  if (!auth) return Response.json({ user: null }, { status: 401 });
  const b = await getBusinessForUser(auth.user.id);
  return Response.json({
    user: { id: auth.user.id, email: auth.user.email, name: auth.user.name, emailVerified: Boolean(auth.user.emailVerifiedAt) },
    business: b ? { id: b.id, name: b.name, onboardingCompleted: Boolean(b.onboardingCompletedAt) } : null,
  });
});
