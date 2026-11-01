import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { demoTemplatesAllowed } from "@/lib/env";
import type { TemplateVersionRow } from "@/lib/db/types";
import { DocumentGenerationError } from "./compose";
import { parseTemplateContent, type TemplateContent } from "./engine";

export interface ResolvedTemplate {
  versionId: string;
  versionLabel: string;
  isDemo: boolean;
  content: TemplateContent;
  reviewSummary?: string;
}

function toResolved(v: TemplateVersionRow): ResolvedTemplate {
  return {
    versionId: v.id,
    versionLabel: v.version_label,
    isDemo: v.is_demo,
    content: parseTemplateContent(v.content),
    reviewSummary: v.legal_reviewer_name
      ? `Revisada por ${v.legal_reviewer_name} el ${new Date(v.legal_reviewed_at!).toLocaleDateString("es-ES")}`
      : undefined,
  };
}

/**
 * Versión de plantilla aplicable a un tipo de documento:
 *  1. la versión publicada (aprobada jurídicamente), o
 *  2. solo fuera de producción y con ALLOW_DEMO_TEMPLATES=true, la última
 *     versión de demostración (los documentos quedan marcados como no válidos).
 * Cualquier otro caso bloquea la generación.
 */
export async function resolveActiveTemplate(db: SupabaseClient, documentType: string): Promise<ResolvedTemplate> {
  const { data: template, error } = await db
    .from("templates")
    .select("id, published_version_id")
    .eq("document_type", documentType)
    .maybeSingle();
  if (error) throw error;
  if (!template) throw new DocumentGenerationError(`No existe plantilla para «${documentType}».`, "template_unavailable");

  if (template.published_version_id) {
    const { data: v, error: vErr } = await db.from("template_versions").select("*").eq("id", template.published_version_id).single();
    if (vErr) throw vErr;
    return toResolved(v as TemplateVersionRow);
  }

  if (demoTemplatesAllowed()) {
    const { data: demo } = await db
      .from("template_versions")
      .select("*")
      .eq("template_id", template.id)
      .eq("is_demo", true)
      .neq("status", "retired")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (demo) return toResolved(demo as TemplateVersionRow);
  }

  throw new DocumentGenerationError(
    "Este documento todavía no está disponible: su plantilla está pendiente de revisión jurídica.",
    "template_unavailable",
    { documentType },
  );
}

/** Carga una versión concreta (p. ej. la congelada en una compra de pago único). */
export async function loadTemplateVersion(db: SupabaseClient, versionId: string): Promise<ResolvedTemplate> {
  const { data, error } = await db.from("template_versions").select("*").eq("id", versionId).single();
  if (error) throw error;
  const v = data as TemplateVersionRow;
  if (v.is_demo && !demoTemplatesAllowed()) {
    throw new DocumentGenerationError("La versión de plantilla asociada no es válida en este entorno.", "template_unavailable");
  }
  if (!v.is_demo && !["published", "retired"].includes(v.status)) {
    throw new DocumentGenerationError("La versión de plantilla asociada no está aprobada.", "template_unavailable");
  }
  return toResolved(v);
}

/** Comprueba si todos los tipos indicados tienen plantilla utilizable (para permitir la venta). */
export async function templatesAvailable(db: SupabaseClient, documentTypes: string[]): Promise<{ ok: boolean; unavailable: string[] }> {
  const unavailable: string[] = [];
  for (const t of documentTypes) {
    try {
      await resolveActiveTemplate(db, t);
    } catch (e) {
      if (e instanceof DocumentGenerationError) unavailable.push(t);
      else throw e;
    }
  }
  return { ok: unavailable.length === 0, unavailable };
}
