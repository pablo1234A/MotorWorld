import { requireApiSession } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";
import { completeOnboarding } from "@/server/services/account";

export const POST = route(async () => {
  const context = await requireApiSession();
  await completeOnboarding(context);
  return ok({ completed: true });
});
