import { z } from "zod";
import { isUuid } from "@/lib/utils";
import { requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, parseBody, route } from "@/server/http/handler";
import { listVersions, restoreVersion } from "@/server/services/listings";

type Params = { id: string };

export const GET = route<Params>(async (_request, { id }) => {
  const context = await requireApiSession();
  if (!isUuid(id)) throw notFound("El anuncio");
  return ok(await listVersions(context, id));
});

/** Restaura una versión anterior (genera una versión nueva; no se pierde historial). */
export const POST = route<Params>(async (request, { id }) => {
  const context = await requireApiSession();
  if (!isUuid(id)) throw notFound("El anuncio");
  const input = await parseBody(request, z.object({ versionNumber: z.number().int().min(1).max(100000) }));
  return ok(await restoreVersion(context, id, input.versionNumber));
});
