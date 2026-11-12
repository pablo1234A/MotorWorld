import { isUuid } from "@/lib/utils";
import { requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { limitUser, ok, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { getJob, retryJob } from "@/server/services/jobs";

export const POST = route<{ id: string }>(async (_request, { id }) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.mutation, context.user.id);
  if (!isUuid(id)) throw notFound("El trabajo");
  await getJob(context, id);
  return ok(await retryJob(context, id));
});
