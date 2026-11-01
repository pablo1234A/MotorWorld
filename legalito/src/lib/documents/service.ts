import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { loadEntitlements } from "@/lib/billing/data";
import type { EntitlementSource } from "@/lib/billing/entitlements";
import type { FormResponseRow } from "@/lib/db/types";
import { sendEmail } from "@/lib/email/send";
import { logError } from "@/lib/observability";
import { composeDocument, composePdf, DocumentGenerationError, prepareInput } from "./compose";
import { renderHtmlFragment, type OutputMeta } from "./html";
import { documentTypeName } from "./registry";
import { loadTemplateVersion, resolveActiveTemplate, type ResolvedTemplate } from "./templates-repo";

export interface GenerateInput {
  organizationId: string;
  /** Usuario que solicita la generación (null si la dispara un webhook). */
  userId: string | null;
  /** Clave de lote idempotente. Reintentos con la misma clave no duplican documentos. */
  batchKey: string;
  /** Fuerza una fuente concreta (p. ej. la compra recién pagada). */
  purchaseId?: string;
  notifyEmail?: string | null;
  /** Solo suscripciones: generar únicamente estos tipos (p. ej. regenerar un documento). */
  documentTypes?: string[];
}

export interface GeneratedItem {
  documentType: string;
  versionId: string;
  versionNumber: number;
  isDemo: boolean;
}

/** Última respuesta completada del formulario de la organización. */
export async function latestCompletedResponse(organizationId: string): Promise<FormResponseRow | null> {
  const { data, error } = await createAdminClient()
    .from("form_responses")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as FormResponseRow) ?? null;
}

/**
 * Genera los documentos de una organización:
 *  1-3. recibe y valida las respuestas, detecta datos faltantes,
 *  4.   comprueba permisos de pago (solo datos del servidor),
 *  5-6. selecciona la versión de plantilla, aplica reglas y variables,
 *  7.   registra la versión de plantilla usada,
 *  8.   genera PDF y HTML,
 *  9.   los guarda en almacenamiento privado,
 *  10.  quedan disponibles para descarga mediante URL firmada.
 */
export async function generateDocuments(input: GenerateInput): Promise<GeneratedItem[]> {
  const db = createAdminClient();

  // Idempotencia: si el lote ya se generó, se devuelve lo existente.
  const { data: existing } = await db
    .from("document_versions")
    .select("id, version_number, is_demo, generation_key, documents!document_versions_document_id_fkey(document_type)")
    .eq("organization_id", input.organizationId)
    .like("generation_key", `${input.batchKey}:%`);
  if (existing && existing.length > 0) {
    return existing.map((r) => ({
      documentType: (r.documents as unknown as { document_type: string }).document_type,
      versionId: r.id as string,
      versionNumber: r.version_number as number,
      isDemo: r.is_demo as boolean,
    }));
  }

  const response = await latestCompletedResponse(input.organizationId);
  if (!response) {
    throw new DocumentGenerationError("Completa el formulario antes de generar tus documentos.", "invalid_answers");
  }
  const prepared = prepareInput(response.answers);
  if (!prepared.validation.valid) {
    throw new DocumentGenerationError("Tus respuestas tienen errores. Revísalas antes de generar.", "invalid_answers", prepared.validation.errors);
  }

  const entitlements = await loadEntitlements(db, input.organizationId);
  let source: EntitlementSource | null = entitlements.source;
  if (input.purchaseId) {
    const p = entitlements.activePurchases.find((x) => x.id === input.purchaseId);
    source = p
      ? { type: "purchase", purchaseId: p.id, documentTypes: p.document_types, remaining: null, lockedVersions: p.template_version_ids ?? {} }
      : null;
  }
  if (!source || (!input.purchaseId && !entitlements.canGenerate)) {
    throw new DocumentGenerationError(entitlements.blockedReason ?? "No tienes permiso para generar documentos.", "not_entitled");
  }

  // Selección de documentos: los suscriptores pueden regenerar solo algunos; las compras regeneran el conjunto.
  let documentTypes = source.documentTypes;
  if (source.type === "subscription" && input.documentTypes?.length) {
    documentTypes = source.documentTypes.filter((t) => input.documentTypes!.includes(t));
    if (documentTypes.length === 0) throw new DocumentGenerationError("Ese documento no está incluido en tu plan.", "not_entitled");
  }
  // Cupo mensual del plan: se comprueba antes de generar nada.
  if (source.type === "subscription" && source.remaining !== null && documentTypes.length > source.remaining) {
    throw new DocumentGenerationError(
      source.remaining === 0
        ? `Has usado los ${source.limit} documentos de tu plan en este periodo. Se renuevan con tu próxima factura o puedes cambiar a un plan superior.`
        : `Te ${source.remaining === 1 ? "queda 1 documento" : `quedan ${source.remaining} documentos`} este periodo y quieres generar ${documentTypes.length}. Regenera solo los que necesites o cambia de plan.`,
      "limit_reached",
    );
  }

  // Resolver plantillas antes de consumir nada.
  const templates: { documentType: string; template: ResolvedTemplate }[] = [];
  for (const documentType of documentTypes) {
    const locked = source.type === "purchase" ? source.lockedVersions[documentType] : undefined;
    const template = locked ? await loadTemplateVersion(db, locked) : await resolveActiveTemplate(db, documentType);
    templates.push({ documentType, template });
  }

  // Componer todo en memoria: si falta algún dato, no se consume ninguna generación.
  const now = new Date();
  const ownerName = prepared.context.owner.display_name;
  const composed = await Promise.all(
    templates.map(async ({ documentType, template }) => {
      const meta: OutputMeta = {
        documentTypeName: documentTypeName(documentType),
        ownerName,
        website: prepared.context.contact.website,
        generatedAt: now,
        templateVersionLabel: template.versionLabel,
        isDemo: template.isDemo,
        reviewSummary: template.reviewSummary,
      };
      const doc = composeDocument(template.content, prepared.context, meta);
      const pdf = await composePdf(doc, meta);
      return { documentType, template, doc, pdf, title: doc.render.document.title };
    }),
  );

  let consumed = false;
  if (source.type === "purchase") {
    const { data: ok, error } = await db.rpc("consume_purchase_generation", { p_purchase_id: source.purchaseId });
    if (error) throw error;
    if (!ok) throw new DocumentGenerationError("Has agotado las generaciones incluidas en tu compra.", "limit_reached");
    consumed = true;
  }

  const results: GeneratedItem[] = [];
  const uploaded: string[] = [];
  try {
    for (const c of composed) {
      const versionId = randomUUID();
      const base = `${input.organizationId}/${c.documentType}/${versionId}`;
      const htmlPath = `${base}.html`;
      const pdfPath = `${base}.pdf`;

      const up1 = await db.storage.from("documents").upload(htmlPath, new Blob([c.doc.html], { type: "text/html" }), {
        contentType: "text/html; charset=utf-8",
        upsert: false,
      });
      if (up1.error) throw up1.error;
      uploaded.push(htmlPath);
      const up2 = await db.storage.from("documents").upload(pdfPath, new Blob([new Uint8Array(c.pdf)], { type: "application/pdf" }), {
        contentType: "application/pdf",
        upsert: false,
      });
      if (up2.error) throw up2.error;
      uploaded.push(pdfPath);

      const { data, error } = await db
        .rpc("record_document_version", {
          p_version_id: versionId,
          p_organization_id: input.organizationId,
          p_document_type: c.documentType,
          p_title: c.title,
          p_template_version_id: c.template.versionId,
          p_form_response_id: response.id,
          p_answers_snapshot: prepared.validation.cleaned,
          p_entitlement_source: source.type,
          p_subscription_id: source.type === "subscription" ? source.subscriptionId : null,
          p_purchase_id: source.type === "purchase" ? source.purchaseId : null,
          p_generation_key: `${input.batchKey}:${c.documentType}`,
          p_is_demo: c.template.isDemo,
          p_html_path: htmlPath,
          p_pdf_path: pdfPath,
          p_content_hash: c.doc.contentHash,
          p_generated_by: input.userId,
        })
        .single();
      if (error) {
        // El cupo también se comprueba en base de datos (generaciones simultáneas).
        if (/quota_exceeded/.test(error.message)) {
          throw new DocumentGenerationError(
            results.length
              ? `Has alcanzado el cupo de tu plan: se han generado ${results.length} de ${composed.length} documentos. El resto podrás generarlo cuando se renueve el cupo o si cambias de plan.`
              : "Has alcanzado el cupo de documentos de tu plan en este periodo. Se renueva con tu próxima factura o puedes cambiar a un plan superior.",
            "limit_reached",
          );
        }
        throw error;
      }
      results.push({
        documentType: c.documentType,
        versionId,
        versionNumber: (data as { version_number: number }).version_number,
        isDemo: c.template.isDemo,
      });
    }
  } catch (e) {
    // Compensación: se borran archivos huérfanos y se devuelve la generación si no se registró nada.
    if (uploaded.length) await db.storage.from("documents").remove(uploaded.filter((p) => !results.some((r) => p.includes(r.versionId))));
    if (consumed && results.length === 0 && source.type === "purchase") {
      await db.rpc("release_purchase_generation", { p_purchase_id: source.purchaseId });
    }
    if (!(e instanceof DocumentGenerationError)) await logError("documents.generate", e, { organizationId: input.organizationId, batchKey: input.batchKey });
    throw e instanceof DocumentGenerationError
      ? e
      : new DocumentGenerationError("No hemos podido generar tus documentos. Inténtalo de nuevo en unos minutos.", "internal");
  }

  if (input.notifyEmail) {
    await sendEmail({
      key: `documents_ready:${input.batchKey}`,
      to: input.notifyEmail,
      email: {
        template: "documents_ready",
        data: { documents: results.map((r) => documentTypeName(r.documentType)), isDemo: results.some((r) => r.isDemo) },
      },
      userId: input.userId,
      organizationId: input.organizationId,
    });
  }
  return results;
}

/**
 * Vista previa previa al pago: se muestra la estructura completa y el texto de
 * las primeras secciones; el resto se reserva para el documento final.
 */
export async function buildPreview(answers: Record<string, unknown>, documentType: string, visibleSections = 2) {
  const db = createAdminClient();
  const prepared = prepareInput(answers);
  const template = await resolveActiveTemplate(db, documentType);
  const meta: OutputMeta = {
    documentTypeName: documentTypeName(documentType),
    ownerName: prepared.context.owner.display_name,
    website: prepared.context.contact.website,
    generatedAt: new Date(),
    templateVersionLabel: template.versionLabel,
    isDemo: template.isDemo,
    isPreview: true,
  };
  const composed = composeDocument(template.content, prepared.context, meta);
  const doc = composed.render.document;
  const truncated = {
    ...doc,
    sections: doc.sections.map((s, i) =>
      i < visibleSections
        ? s
        : { ...s, blocks: [{ type: "callout" as const, tone: "info" as const, text: "Contenido completo disponible al finalizar la compra." }] },
    ),
  };
  return {
    html: renderHtmlFragment(truncated, meta),
    isDemo: template.isDemo,
    sections: doc.sections.length,
    requirements: prepared.requirements,
  };
}
