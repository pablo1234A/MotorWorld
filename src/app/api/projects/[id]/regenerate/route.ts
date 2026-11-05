import { z } from "zod";
import { AiError, generateProject } from "@/ai/claude";
import { STYLE_IDS } from "@/engine/schema";
import { handler, HttpError, json, parseBody, rateLimit, requireUser } from "@/server/http";
import { addVersion, getOwnedProject, saveProject } from "@/server/projects";

export const maxDuration = 300;

const body = z.object({
  brief: z.string().trim().min(12).max(4000).optional(),
  style: z.enum(STYLE_IDS).optional(),
  mode: z.enum(["light", "dark"]).optional(),
  seed: z.number().int().optional(),
});

/** Generates a fresh variation of the whole site. The previous state stays in the history. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await params;
  rateLimit(`generate:${user.id}`, 30, 60 * 60_000);
  const input = await parseBody(req, body);
  const p = await getOwnedProject(user.id, id);
  try {
    await addVersion(id, p.doc, "Antes de regenerar", "auto");
    const r = await generateProject({ brief: input.brief ?? p.doc.brief, kind: p.doc.kind, style: input.style, mode: input.mode, name: p.doc.settings.siteName, seed: input.seed ?? Date.now() % 2147483647 });
    r.doc.library = p.doc.library;
    r.doc.settings = { ...r.doc.settings, notifyEmail: p.doc.settings.notifyEmail, formWebhook: p.doc.settings.formWebhook };
    const revision = await saveProject(user.id, id, r.doc, p.revision, { label: "Sitio regenerado", source: "ai" });
    return json({ doc: r.doc, revision, engine: r.engine });
  } catch (e) {
    if (e instanceof AiError) throw new HttpError(502, e.message);
    throw e;
  }
});
