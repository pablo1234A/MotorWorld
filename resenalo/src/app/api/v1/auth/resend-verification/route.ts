import { userRoute } from "@/server/http/tenant";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { sendVerificationEmail } from "@/server/auth/service";

export const POST = userRoute(
  async (_req, { user }) => {
    if (user.emailVerifiedAt) return Response.json({ ok: true, alreadyVerified: true });
    await enforceRateLimit(`resend-verify:${user.id}`, 3, 3600, "Ya te hemos enviado varios correos. Revisa tu bandeja (y la carpeta de spam) o inténtalo en una hora.");
    await sendVerificationEmail(user);
    return Response.json({ ok: true });
  },
  { verified: false },
);
