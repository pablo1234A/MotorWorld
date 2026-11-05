import { handler, HttpError, json, rateLimit, requireUser } from "@/server/http";
import { getOwnedProject } from "@/server/projects";
import { saveUpload } from "@/server/storage";

export const POST = handler(async (req: Request) => {
  const user = await requireUser(req);
  rateLimit(`upload:${user.id}`, 60, 10 * 60_000);
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "Envía el archivo como multipart/form-data.");
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Falta el archivo.");
  const projectId = typeof form.get("projectId") === "string" ? (form.get("projectId") as string) : null;
  if (projectId) await getOwnedProject(user.id, projectId);
  const asset = await saveUpload(user.id, projectId, file);
  return json({ asset }, 201);
});
