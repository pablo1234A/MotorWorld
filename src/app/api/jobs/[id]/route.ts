import { isUuid } from "@/lib/utils";
import { requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, route } from "@/server/http/handler";
import { getJob } from "@/server/services/jobs";

export const GET = route<{ id: string }>(async (_request, { id }) => {
  const context = await requireApiSession();
  if (!isUuid(id)) throw notFound("El trabajo");
  return ok(await getJob(context, id));
});
