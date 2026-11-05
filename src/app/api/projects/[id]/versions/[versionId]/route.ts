import { handler, json, requireUser } from "@/server/http";
import { addVersion, getOwnedProject, getVersion, saveProject } from "@/server/projects";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, versionId } = await params;
  await getOwnedProject(user.id, id);
  const v = await getVersion(id, versionId);
  return json({ version: { id: v.id, label: v.label, source: v.source, createdAt: v.createdAt, doc: v.doc } });
});

/** Restores a version. The current state is snapshotted first, so a restore is itself undoable. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id, versionId } = await params;
  const p = await getOwnedProject(user.id, id);
  const v = await getVersion(id, versionId);
  await addVersion(id, p.doc, "Antes de restaurar", "auto");
  const revision = await saveProject(user.id, id, v.doc, p.revision, { label: `Restaurado: ${v.label}`, source: "restore" });
  return json({ revision, doc: v.doc });
});
