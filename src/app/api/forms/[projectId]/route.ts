import type { FormSpec, SiteDocument } from "@/engine/schema";
import { getDb, schema } from "@/server/db";
import { clientIp, handler, rateLimit } from "@/server/http";
import { newId } from "@/server/ids";
import { forwardWebhook, sendSubmissionEmail } from "@/server/integrations";
import { getProjectRow, getPublication } from "@/server/projects";

/**
 * Public form endpoint used by published and exported sites (any origin, no cookies).
 * Submissions are validated against the form definition stored in the project, so only
 * declared fields are accepted.
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept", "Access-Control-Max-Age": "86400" };

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function findForm(doc: SiteDocument, formId: string): FormSpec | null {
  for (const p of doc.pages) for (const s of p.sections) if (s.content.form?.id === formId) return s.content.form;
  return null;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export const POST = handler(async (req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await params;
  try {
    rateLimit(`form:${projectId}:${clientIp(req)}`, 8, 10 * 60_000);
  } catch {
    return reply({ error: "Has enviado demasiados mensajes. Inténtalo más tarde." }, 429);
  }
  const ctype = req.headers.get("content-type") ?? "";
  let raw: Record<string, unknown> = {};
  try {
    if (ctype.includes("application/json")) raw = (await req.json()) as Record<string, unknown>;
    else {
      const fd = await req.formData();
      fd.forEach((v, k) => (raw[k] = typeof v === "string" ? v : ""));
    }
  } catch {
    return reply({ error: "Datos no válidos." }, 400);
  }
  // Honeypot: bots fill hidden fields. Pretend success, store nothing.
  if (typeof raw._gotcha === "string" && raw._gotcha.trim()) return reply({ ok: true });

  const project = await getProjectRow(projectId);
  if (!project) return reply({ error: "Formulario no encontrado." }, 404);
  const pub = await getPublication(projectId);
  const formId = String(raw._form ?? "");
  const form = (pub && findForm(pub.doc, formId)) || findForm(project.doc, formId);
  if (!form) return reply({ error: "Formulario no encontrado." }, 404);

  const data: Record<string, string> = {};
  for (const f of form.fields) {
    const v = raw[f.name];
    const value = (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v)).trim().slice(0, f.type === "textarea" ? 4000 : 300);
    if (f.required && !value) return reply({ error: `El campo «${f.label}» es obligatorio.` }, 422);
    if (value && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return reply({ error: "El email no es válido." }, 422);
    if (value && f.type === "select" && f.options?.length && !f.options.includes(value)) return reply({ error: `Opción no válida en «${f.label}».` }, 422);
    if (value) data[f.name] = value;
  }
  if (!Object.keys(data).length) return reply({ error: "El formulario está vacío." }, 422);
  const page = String(raw._page ?? "/").slice(0, 120);

  const db = await getDb();
  await db.insert(schema.formSubmissions).values({ id: newId("sub"), projectId, formId, page, data });

  const doc = pub?.doc ?? project.doc;
  // Notifications never block or fail the visitor's submission.
  await Promise.allSettled([
    doc.settings.notifyEmail ? sendSubmissionEmail(doc.settings.notifyEmail, doc.settings.siteName, page, data) : Promise.resolve(),
    doc.settings.formWebhook ? forwardWebhook(doc.settings.formWebhook, { site: doc.settings.siteName, projectId, formId, page, data, submittedAt: new Date().toISOString() }) : Promise.resolve(),
  ]);
  return reply({ ok: true });
});

