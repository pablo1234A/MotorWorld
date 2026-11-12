import { requireApiSession } from "@/server/auth/session";
import { limitUser, ok, parseBody, parseQuery, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { createJob, listJobs } from "@/server/services/jobs";
import { jobCreateSchema, jobListQuerySchema } from "@/validation/schemas";

export const GET = route(async (request) => {
  const context = await requireApiSession();
  const query = parseQuery(request, jobListQuerySchema);
  return ok(await listJobs(context, query.page, query.pageSize));
});

/** Paso 3: crea el trabajo de generación masiva y reserva el consumo. */
export const POST = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.mutation, context.user.id);
  const input = await parseBody(request, jobCreateSchema);
  return ok(await createJob(context, input), 201);
});
