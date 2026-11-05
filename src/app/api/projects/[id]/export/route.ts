import { slugify } from "@/engine/util";
import { buildStaticSite, zipFiles } from "@/server/export";
import { appUrl, handler, json, requireUser } from "@/server/http";
import { getOwnedProject } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

/** GET ?format=zip (default) → static site; ?format=json → document only. */
export const GET = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const p = await getOwnedProject(user.id, id);
  const format = new URL(req.url).searchParams.get("format") ?? "zip";
  const name = slugify(p.name) || "sitio";
  if (format === "json") {
    return new Response(JSON.stringify(p.doc, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.world.json"` },
    });
  }
  if (format !== "zip") return json({ error: "Formato no admitido." }, 400);
  const files = await buildStaticSite(p.doc, p.id, appUrl(req));
  const zip = zipFiles(files);
  return new Response(Buffer.from(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}.zip"`, "Cache-Control": "no-store" },
  });
});
