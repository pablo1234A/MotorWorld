import { handler, json, requireUser } from "@/server/http";
import { deleteAsset } from "@/server/storage";

export const DELETE = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await params;
  await deleteAsset(user.id, id);
  return json({ ok: true });
});
