import { z } from "zod";
import { handler, json, parseBody, requireUser } from "@/server/http";
import { changeSlug, deleteProject, getOwnedProject, getPublication, saveProject, validateDocOrThrow } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const p = await getOwnedProject(user.id, id);
  const pub = await getPublication(id);
  return json({ project: { id: p.id, name: p.name, slug: p.slug, revision: p.revision, engine: p.engine, doc: p.doc, updatedAt: p.updatedAt, publishedAt: pub?.publishedAt ?? null } });
});

const putBody = z.object({
  doc: z.unknown(),
  baseRevision: z.number().int().optional(),
  version: z.object({ label: z.string().min(1).max(120), source: z.enum(["manual", "auto", "ai", "restore"]) }).optional(),
});

export const PUT = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id } = await params;
  const body = await parseBody(req, putBody);
  const doc = validateDocOrThrow(body.doc);
  const revision = await saveProject(user.id, id, doc, body.baseRevision, body.version);
  return json({ revision, savedAt: new Date().toISOString() });
});

const patchBody = z.object({ slug: z.string().min(1).max(60) });

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id } = await params;
  const body = await parseBody(req, patchBody);
  const slug = await changeSlug(user.id, id, body.slug);
  return json({ slug });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id } = await params;
  await deleteProject(user.id, id);
  return json({ ok: true });
});
