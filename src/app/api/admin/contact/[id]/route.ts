import { z } from "zod";
import { isUuid } from "@/lib/utils";
import { requireApiAdmin } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, parseBody, route } from "@/server/http/handler";
import { adminSetContactHandled } from "@/server/services/admin";

export const PATCH = route<{ id: string }>(async (request, { id }) => {
  const actor = await requireApiAdmin();
  if (!isUuid(id)) throw notFound("El mensaje");
  const input = await parseBody(request, z.object({ handled: z.boolean() }));
  await adminSetContactHandled(actor, id, input.handled);
  return ok({ handled: input.handled });
});
