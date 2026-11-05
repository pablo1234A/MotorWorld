import { z } from "zod";
import { generateProject, AiError } from "@/ai/claude";
import { PROJECT_KINDS, STYLE_IDS } from "@/engine/schema";
import { handler, HttpError, json, parseBody, rateLimit, requireUser } from "@/server/http";
import { createProject, listProjects } from "@/server/projects";
import { validateDocument } from "@/engine/validate";

export const maxDuration = 300;

const createBody = z.object({
  brief: z.string().trim().min(12, "Describe tu web con un poco más de detalle (mínimo 12 caracteres).").max(4000),
  kind: z.enum(PROJECT_KINDS).optional(),
  style: z.enum(STYLE_IDS).optional(),
  mode: z.enum(["light", "dark"]).optional(),
  name: z.string().trim().max(80).optional(),
  pages: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
  seed: z.number().int().optional(),
});

export const GET = handler(async () => {
  const user = await requireUser();
  const rows = await listProjects(user.id);
  return json({
    projects: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      kind: r.kind,
      engine: r.engine,
      updatedAt: r.updatedAt,
      publishedAt: r.publishedAt,
      pages: r.doc.pages.length,
      theme: { style: r.doc.theme.style, mode: r.doc.theme.mode, colors: r.doc.theme.colors, fonts: r.doc.theme.fonts },
    })),
  });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser(req);
  rateLimit(`generate:${user.id}`, 30, 60 * 60_000);
  const input = await parseBody(req, createBody);
  try {
    const result = await generateProject(input);
    const project = await createProject(user.id, result.doc, result.engine);
    const qa = validateDocument(result.doc);
    return json({ project: { id: project.id, slug: project.slug }, engine: result.engine, model: result.model, fixes: result.fixes, qa: { score: qa.score, issues: qa.issues.length } }, 201);
  } catch (e) {
    if (e instanceof AiError) throw new HttpError(502, e.message);
    throw e;
  }
});
