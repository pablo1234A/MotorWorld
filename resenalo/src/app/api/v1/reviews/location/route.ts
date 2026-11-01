import { z } from "zod";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { listLocations, selectLocation } from "@/server/modules/reviews";
import { AppError } from "@/server/http/errors";

export const POST = tenantRoute(async (req, { business }) => {
  const b = await readJson(req, z.object({ account: z.string().max(100), location: z.string().max(100) }));
  // Solo se puede elegir una ficha que la cuenta conectada gestiona realmente.
  const loc = (await listLocations(business.id)).find((l) => l.account === b.account && l.location === b.location);
  if (!loc) throw new AppError("NOT_FOUND", "Esa ficha no pertenece a la cuenta de Google conectada.");
  await selectLocation(business.id, loc);
  return Response.json({ ok: true });
});
