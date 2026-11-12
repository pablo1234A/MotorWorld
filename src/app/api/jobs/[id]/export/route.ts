import { isUuid } from "@/lib/utils";
import { requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { limitUser, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { exportJob } from "@/server/services/jobs";

export const GET = route<{ id: string }>(async (_request, { id }) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.export, context.user.id);
  if (!isUuid(id)) throw notFound("El trabajo");
  const file = await exportJob(context, id);
  return new Response(file.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
