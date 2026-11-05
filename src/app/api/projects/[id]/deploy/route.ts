import { slugify } from "@/engine/util";
import { getDb, schema } from "@/server/db";
import { buildStaticSite } from "@/server/export";
import { appUrl, handler, json, requireUser } from "@/server/http";
import { newId } from "@/server/ids";
import { deployToVercel } from "@/server/integrations";
import { getOwnedProject } from "@/server/projects";

export const maxDuration = 120;

/** Deploys the static export to Vercel through the Deployments API (requires VERCEL_TOKEN). */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await params;
  const p = await getOwnedProject(user.id, id);
  const files = await buildStaticSite(p.doc, p.id, appUrl(req));
  const db = await getDb();
  try {
    const d = await deployToVercel(`wb-${slugify(p.slug)}`.slice(0, 52), files);
    await db.insert(schema.deployments).values({ id: newId("dep"), projectId: id, provider: "vercel", status: d.state, url: d.url, meta: { vercelId: d.id } });
    return json({ url: d.url, state: d.state });
  } catch (e) {
    await db.insert(schema.deployments).values({ id: newId("dep"), projectId: id, provider: "vercel", status: "error", url: null, meta: { error: (e as Error).message } });
    throw e;
  }
});
