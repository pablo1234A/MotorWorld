import { isUuid } from "@/lib/utils";
import { requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, route } from "@/server/http/handler";
import { setFavorite } from "@/server/services/listings";

type Params = { id: string };

export const PUT = route<Params>(async (_request, { id }) => {
  const context = await requireApiSession();
  if (!isUuid(id)) throw notFound("El anuncio");
  await setFavorite(context, id, true);
  return ok({ favorite: true });
});

export const DELETE = route<Params>(async (_request, { id }) => {
  const context = await requireApiSession();
  if (!isUuid(id)) throw notFound("El anuncio");
  await setFavorite(context, id, false);
  return ok({ favorite: false });
});
