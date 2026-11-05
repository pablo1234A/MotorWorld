import { handler, json, requireUser } from "@/server/http";
import { listAssets } from "@/server/storage";

export const GET = handler(async () => {
  const user = await requireUser();
  return json({ assets: await listAssets(user.id) });
});
