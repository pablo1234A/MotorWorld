import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient, createSessionClient } from "@/lib/supabase/server";
import { canDownloadVersion } from "@/lib/billing/entitlements";
import { audit, logError } from "@/lib/observability";
import { documentTypeName } from "@/lib/documents/registry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Descarga privada de un documento.
 *  1. Sesión obligatoria.
 *  2. La versión se lee con la sesión del usuario: RLS impide ver versiones de
 *     otras organizaciones (respuesta 404, sin revelar su existencia).
 *  3. Se comprueba que el acceso no ha sido revocado (p. ej. reembolso).
 *  4. Se emite una URL firmada de 60 segundos.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documentos/[versionId]/descargar">) {
  const { versionId } = await ctx.params;
  const format = request.nextUrl.searchParams.get("formato") === "html" ? "html" : "pdf";
  const noStore = { "Cache-Control": "private, no-store" };

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: noStore });
  if (!UUID.test(versionId)) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: noStore });

  const db = await createSessionClient();
  const { data: version } = await db
    .from("document_versions")
    .select("id, organization_id, version_number, html_path, pdf_path, revoked_at, documents(document_type)")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: noStore });
  if (!canDownloadVersion(version)) {
    return NextResponse.json({ error: "El acceso a este documento ha sido revocado." }, { status: 403, headers: noStore });
  }

  const path = format === "html" ? (version.html_path as string) : (version.pdf_path as string);
  // Defensa adicional: la ruta del archivo debe pertenecer a la organización de la versión.
  if (!path.startsWith(`${version.organization_id}/`)) {
    await logError("documents.download", new Error("Ruta de almacenamiento incoherente"), { versionId });
    return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: noStore });
  }

  const type = (version.documents as unknown as { document_type: string }).document_type;
  const filename = `${documentTypeName(type).toLowerCase().replace(/\s+/g, "-").normalize("NFD").replace(/[̀-ͯ]/g, "")}-v${version.version_number}.${format}`;
  const { data, error } = await createAdminClient().storage.from("documents").createSignedUrl(path, 60, { download: filename });
  if (error || !data) {
    await logError("documents.download", error ?? new Error("Sin URL firmada"), { versionId });
    return NextResponse.json({ error: "No se ha podido preparar la descarga." }, { status: 500, headers: noStore });
  }

  await audit({ actorId: user.id, action: "document.downloaded", entityType: "document_version", entityId: versionId, organizationId: version.organization_id as string, metadata: { format } });
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: noStore });
}
