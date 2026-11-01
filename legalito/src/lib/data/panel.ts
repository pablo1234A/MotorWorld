import "server-only";
import { createAdminClient, createSessionClient } from "@/lib/supabase/server";
import { requireOrganization } from "@/lib/auth";
import type { DocumentVersionRow, FormResponseRow } from "@/lib/db/types";
import { loadEntitlements } from "@/lib/billing/data";

/**
 * Lecturas del panel del cliente. Los datos propios se leen SIEMPRE con la
 * sesión del usuario (RLS). Solo los metadatos públicos de las plantillas
 * (versión, estado de revisión) se completan con service_role, después de
 * haber obtenido por RLS las versiones de documento del propio cliente.
 */
export interface TemplateMeta {
  id: string;
  version_label: string;
  status: string;
  is_demo: boolean;
  legal_reviewer_name: string | null;
  legal_reviewed_at: string | null;
  published_at: string | null;
}

export interface DocumentVersionView extends DocumentVersionRow {
  template: TemplateMeta | null;
}

export interface DocumentView {
  id: string;
  document_type: string;
  title: string;
  updated_at: string;
  current: DocumentVersionView | null;
  versionCount: number;
  updateAvailable: boolean;
}

async function templateMeta(ids: string[]): Promise<Map<string, TemplateMeta>> {
  if (ids.length === 0) return new Map();
  const { data } = await createAdminClient()
    .from("template_versions")
    .select("id, version_label, status, is_demo, legal_reviewer_name, legal_reviewed_at, published_at")
    .in("id", Array.from(new Set(ids)));
  return new Map((data ?? []).map((t) => [t.id as string, t as TemplateMeta]));
}

async function publishedVersions(): Promise<Map<string, string>> {
  const { data } = await createAdminClient().from("templates").select("document_type, published_version_id");
  return new Map((data ?? []).filter((t) => t.published_version_id).map((t) => [t.document_type as string, t.published_version_id as string]));
}

export async function listDocuments(): Promise<DocumentView[]> {
  const { org } = await requireOrganization();
  const db = await createSessionClient();
  const [{ data: docs }, { data: versions }] = await Promise.all([
    db.from("documents").select("id, document_type, title, updated_at, current_version_id").eq("organization_id", org.id).order("document_type"),
    db.from("document_versions").select("*").eq("organization_id", org.id),
  ]);
  const vs = (versions ?? []) as DocumentVersionRow[];
  const [meta, published] = await Promise.all([templateMeta(vs.map((v) => v.template_version_id)), publishedVersions()]);
  return (docs ?? []).map((d) => {
    const current = vs.find((v) => v.id === d.current_version_id) ?? null;
    const pub = published.get(d.document_type as string);
    return {
      id: d.id as string,
      document_type: d.document_type as string,
      title: d.title as string,
      updated_at: d.updated_at as string,
      current: current ? { ...current, template: meta.get(current.template_version_id) ?? null } : null,
      versionCount: vs.filter((v) => v.document_id === d.id).length,
      updateAvailable: Boolean(current && pub && pub !== current.template_version_id),
    };
  });
}

export async function getDocumentWithVersions(id: string) {
  const { org } = await requireOrganization();
  const db = await createSessionClient();
  const { data: doc } = await db.from("documents").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!doc) return null;
  const { data: versions } = await db.from("document_versions").select("*").eq("document_id", id).order("version_number", { ascending: false });
  const vs = (versions ?? []) as DocumentVersionRow[];
  const [meta, published] = await Promise.all([templateMeta(vs.map((v) => v.template_version_id)), publishedVersions()]);
  return {
    doc: doc as { id: string; document_type: string; title: string; current_version_id: string | null },
    versions: vs.map((v) => ({ ...v, template: meta.get(v.template_version_id) ?? null })),
    publishedVersionId: published.get(doc.document_type as string) ?? null,
  };
}

export async function getFormStatus(): Promise<{ draft: FormResponseRow | null; completed: FormResponseRow | null }> {
  const { org } = await requireOrganization();
  const db = await createSessionClient();
  const [{ data: draft }, { data: completed }] = await Promise.all([
    db.from("form_responses").select("*").eq("organization_id", org.id).eq("status", "draft").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("form_responses").select("*").eq("organization_id", org.id).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { draft: (draft as FormResponseRow) ?? null, completed: (completed as FormResponseRow) ?? null };
}

export async function getMyEntitlements() {
  const { org } = await requireOrganization();
  return loadEntitlements(await createSessionClient(), org.id);
}

export async function getUpdatesAndNotices() {
  const db = await createSessionClient();
  const [{ data: updates }, { data: notices }] = await Promise.all([
    db.from("legal_updates").select("id, title, summary, published_at, document_types").eq("status", "published").order("published_at", { ascending: false }).limit(5),
    db.from("notices").select("id, title, body, level").order("created_at", { ascending: false }).limit(5),
  ]);
  return {
    updates: (updates ?? []) as { id: string; title: string; summary: string; published_at: string; document_types: string[] }[],
    notices: (notices ?? []) as { id: string; title: string; body: string; level: "info" | "warning" | "important" }[],
  };
}
