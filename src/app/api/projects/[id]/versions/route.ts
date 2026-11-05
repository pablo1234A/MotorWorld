import { handler, json, requireUser } from "@/server/http";
import { getOwnedProject, listVersions } from "@/server/projects";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await getOwnedProject(user.id, id);
  return json({ versions: await listVersions(id) });
});
