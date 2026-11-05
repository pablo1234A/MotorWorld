import { desc, eq } from "drizzle-orm";
import { validateDocument } from "@/engine/validate";
import { getDb, schema } from "@/server/db";
import { appUrl, handler, HttpError, json, requireUser } from "@/server/http";
import { getOwnedProject, getPublication, publishProject, unpublishProject } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const p = await getOwnedProject(user.id, id);
  const pub = await getPublication(id);
  const db = await getDb();
  const deployments = await db.select().from(schema.deployments).where(eq(schema.deployments.projectId, id)).orderBy(desc(schema.deployments.createdAt)).limit(10);
  const qa = validateDocument(p.doc);
  return json({
    slug: p.slug,
    url: `${appUrl(req)}/s/${p.slug}`,
    publishedAt: pub?.publishedAt ?? null,
    upToDate: pub ? JSON.stringify(pub.doc) === JSON.stringify(p.doc) : false,
    qa,
    deployments,
    vercel: !!process.env.VERCEL_TOKEN,
  });
});

/** Publishes the saved document. Blocking QA errors stop publication unless `force` is set. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const force = sp.get("force") === "1";
  const ackSamples = sp.get("ack") === "samples";
  const p = await getOwnedProject(user.id, id);
  const qa = validateDocument(p.doc);
  const blocking = qa.issues.filter((i) => i.severity === "error");
  if (blocking.length && !force) throw new HttpError(422, `Hay ${blocking.length} error(es) de QA que corregir antes de publicar.`, blocking.slice(0, 10));
  // Illustrative testimonials, figures or contact details must never go live unnoticed.
  const samples = p.doc.pages.flatMap((pg) => pg.sections.filter((s) => s.sample).map((s) => ({ page: pg.name, sectionId: s.id, type: s.type })));
  if (samples.length && !ackSamples) throw new HttpError(428, `Hay ${samples.length} sección(es) con contenido de ejemplo. Sustitúyelo por datos reales o confirma que lo has revisado.`, samples);
  const r = await publishProject(user.id, id);
  return json({ ...r, url: `${appUrl(req)}/s/${r.slug}`, warnings: qa.issues.filter((i) => i.severity === "warning").length });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const { id } = await params;
  await unpublishProject(user.id, id);
  return json({ ok: true });
});
