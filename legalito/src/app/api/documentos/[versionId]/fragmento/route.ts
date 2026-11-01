import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient, createSessionClient } from "@/lib/supabase/server";
import { canDownloadVersion } from "@/lib/billing/entitlements";
import { audit, logError } from "@/lib/observability";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Devuelve el fragmento HTML (<article>…</article>) de una versión para copiarlo
 * y pegarlo en la web del cliente. Mismas comprobaciones que la descarga.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/documentos/[versionId]/fragmento">) {
  const { versionId } = await ctx.params;
  const noStore = { "Cache-Control": "private, no-store" };
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: noStore });
  if (!UUID.test(versionId)) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: noStore });

  const db = await createSessionClient();
  const { data: version } = await db.from("document_versions").select("id, organization_id, html_path, revoked_at").eq("id", versionId).maybeSingle();
  if (!version) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: noStore });
  if (!canDownloadVersion(version)) return NextResponse.json({ error: "El acceso a este documento ha sido revocado." }, { status: 403, headers: noStore });
  const path = version.html_path as string;
  if (!path.startsWith(`${version.organization_id}/`)) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: noStore });

  const { data, error } = await createAdminClient().storage.from("documents").download(path);
  if (error || !data) {
    await logError("documents.fragment", error ?? new Error("Archivo no encontrado"), { versionId });
    return NextResponse.json({ error: "No se ha podido leer el documento." }, { status: 500, headers: noStore });
  }
  const html = await data.text();
  const match = /<article class="legalito-doc"[\s\S]*<\/article>/.exec(html);
  await audit({ actorId: user.id, action: "document.html_copied", entityType: "document_version", entityId: versionId, organizationId: version.organization_id as string });
  return new NextResponse(match ? match[0] : html, { headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } });
}
