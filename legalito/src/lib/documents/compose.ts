import { createHash } from "node:crypto";
import { buildContext, type DocumentContext } from "./context";
import { documentToPlainText, renderTemplate, type RenderResult, type TemplateContent } from "./engine";
import { renderHtmlDocument, renderHtmlFragment, type OutputMeta } from "./html";
import { renderPdf } from "./pdf";
import { validateAnswers, type Answers, type ValidationResult } from "./questionnaire";
import { computeRequirements, type Requirement } from "./requirements";

/** Error de negocio con mensaje apto para mostrar al usuario. */
export class DocumentGenerationError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_answers" | "missing_data" | "template_unavailable" | "not_entitled" | "limit_reached" | "internal",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DocumentGenerationError";
  }
}

export interface PreparedInput {
  validation: ValidationResult;
  context: DocumentContext;
  requirements: Requirement[];
}

/** Pasos 1–3 del motor: recibir, validar e identificar datos faltantes. */
export function prepareInput(answers: Answers, now = new Date()): PreparedInput {
  const validation = validateAnswers(answers);
  const context = buildContext(validation.cleaned, now);
  return { validation, context, requirements: computeRequirements(context) };
}

export interface ComposedDocument {
  render: RenderResult;
  html: string;
  fragment: string;
  plainText: string;
  contentHash: string;
}

/** Pasos 4–6: seleccionar bloques, aplicar variables y construir el documento. */
export function composeDocument(content: TemplateContent, context: DocumentContext, meta: OutputMeta): ComposedDocument {
  const render = renderTemplate(content, context);
  if (render.missing.length > 0) {
    throw new DocumentGenerationError(
      "Faltan datos necesarios para generar el documento. Revisa tus respuestas.",
      "missing_data",
      render.missing,
    );
  }
  const html = renderHtmlDocument(render.document, meta);
  const plainText = documentToPlainText(render.document);
  return {
    render,
    html,
    fragment: renderHtmlFragment(render.document, meta),
    plainText,
    contentHash: createHash("sha256").update(plainText).digest("hex"),
  };
}

export async function composePdf(composed: ComposedDocument, meta: OutputMeta): Promise<Uint8Array> {
  return renderPdf(composed.render.document, meta);
}
