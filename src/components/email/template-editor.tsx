"use client";

import { useActionState, useId, useMemo, useRef, useState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Card } from "@/components/ui/feedback";
import { fieldErrors, FormMessage } from "@/components/ui/form-state";
import { DEFAULT_TEMPLATES, type TemplateContent, variablesFor } from "@/lib/email/reminder-email";
import { renderSampleEmail } from "@/lib/email/sample";
import { type EditableTemplateKind, TEMPLATE_KIND_LABELS, VARIABLE_HELP } from "@/lib/validation/email";
import type { ActionState } from "@/server/actions/result";
import { restoreTemplateAction, saveTemplateAction } from "@/server/modules/email/actions";

const idle: ActionState = { status: "idle" };

const CONTROL =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[15px] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] aria-[invalid=true]:border-[var(--danger)]";

export interface PreviewData {
  customerFirstName: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  plate: string;
  dueDate: string;
  workshop: { name: string; brandColor: string | null; address: string | null; phone: string | null; email: string | null; logoUrl: string | null };
  ctaHref: string | null;
  fromExample: boolean;
}

export function TemplateEditor({
  kind,
  initial,
  custom,
  sample,
  readOnly,
}: {
  kind: EditableTemplateKind;
  initial: TemplateContent;
  custom: boolean;
  sample: PreviewData;
  readOnly: boolean;
}) {
  const [state, action] = useActionState(saveTemplateAction, idle);
  const [restoreState, restore] = useActionState(restoreTemplateAction, idle);
  const [values, setValues] = useState<TemplateContent>(initial);
  // Tras restaurar, el formulario vuelve a la plantilla original (ajuste de
  // estado durante el render, sin efecto). El estado vive aquí porque el botón
  // desaparece en cuanto la plantilla deja de ser personalizada.
  const [seenRestore, setSeenRestore] = useState(restoreState);
  if (restoreState !== seenRestore) {
    setSeenRestore(restoreState);
    if (restoreState.status === "success") setValues(DEFAULT_TEMPLATES[kind]);
  }
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const uid = useId();

  const preview = useMemo(() => renderSampleEmail(kind, values, sample, "#"), [kind, values, sample]);

  function insertVariable(v: string) {
    const el = bodyRef.current;
    const token = `{${v}}`;
    if (!el) return;
    const start = el.selectionStart ?? values.body.length;
    const end = el.selectionEnd ?? start;
    const body = values.body.slice(0, start) + token + values.body.slice(end);
    setValues({ ...values, body });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const set = (k: keyof TemplateContent) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues({ ...values, [k]: k === "buttonEnabled" ? (e.target as HTMLInputElement).checked : e.target.value });

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{TEMPLATE_KIND_LABELS[kind]}</h2>
        <span className="text-sm text-[var(--muted)]">{custom ? "Personalizada" : "Plantilla original"}</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={action} className="flex min-w-0 flex-col gap-4">
          <FormMessage state={state} />
          <FormMessage state={restoreState} />
          <input type="hidden" name="kind" value={kind} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`subject-${uid}`} className="text-sm font-medium">
              Asunto
            </label>
            <input
              id={`subject-${uid}`}
              name="subject"
              value={values.subject}
              onChange={set("subject")}
              maxLength={200}
              disabled={readOnly}
              aria-invalid={fieldErrors(state, "subject") ? true : undefined}
              className={CONTROL}
            />
            {fieldErrors(state, "subject") ? <p className="text-sm text-[var(--danger)]">{fieldErrors(state, "subject")![0]}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`body-${uid}`} className="text-sm font-medium">
              Texto
            </label>
            <textarea
              id={`body-${uid}`}
              ref={bodyRef}
              name="body"
              rows={9}
              value={values.body}
              onChange={set("body")}
              maxLength={5000}
              disabled={readOnly}
              aria-invalid={fieldErrors(state, "body") ? true : undefined}
              className={CONTROL}
            />
            {fieldErrors(state, "body") ? (
              <p className="text-sm text-[var(--danger)]">{fieldErrors(state, "body")![0]}</p>
            ) : (
              <p className="text-sm text-[var(--muted)]">Deja una línea en blanco para separar párrafos.</p>
            )}
            {readOnly ? null : (
              <div className="flex flex-wrap gap-2" aria-label="Insertar variable">
                {variablesFor(kind).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    title={VARIABLE_HELP[v]}
                    className="rounded-full border border-[var(--border)] px-2.5 py-1 font-mono text-xs hover:bg-[var(--surface-2)]"
                  >
                    {`{${v}}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`button-${uid}`} className="text-sm font-medium">
                Texto del botón
              </label>
              <input
                id={`button-${uid}`}
                name="buttonLabel"
                value={values.buttonLabel}
                onChange={set("buttonLabel")}
                maxLength={40}
                disabled={readOnly || !values.buttonEnabled}
                className={CONTROL}
              />
              {/* Un campo desactivado no se envía: se conserva su valor. */}
              {!values.buttonEnabled ? <input type="hidden" name="buttonLabel" value={values.buttonLabel} /> : null}
              {fieldErrors(state, "buttonLabel") ? <p className="text-sm text-[var(--danger)]">{fieldErrors(state, "buttonLabel")![0]}</p> : null}
            </div>
            <label className="flex items-center gap-2 pb-2.5 text-sm">
              <input type="checkbox" name="buttonEnabled" checked={values.buttonEnabled} onChange={set("buttonEnabled")} disabled={readOnly} className="size-4" />
              Mostrar el botón «Pedir cita»
            </label>
          </div>
          {readOnly ? null : (
            <div className="flex flex-wrap gap-3">
              <SubmitButton name="intent" value="save">
                Guardar plantilla
              </SubmitButton>
              <SubmitButton name="intent" value="test" variant="secondary" pendingLabel="Enviando…">
                Enviarme una prueba
              </SubmitButton>
            </div>
          )}
          {custom && !readOnly ? <RestoreButton action={restore} /> : null}
        </form>

        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm font-medium">Vista previa</p>
          <p className="truncate rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm">
            <span className="text-[var(--muted)]">Asunto: </span>
            {preview.subject}
          </p>
          <iframe
            title={`Vista previa: ${TEMPLATE_KIND_LABELS[kind]}`}
            sandbox=""
            srcDoc={preview.html}
            className="h-[520px] w-full rounded-lg border border-[var(--border)] bg-white"
          />
          {values.buttonEnabled && !sample.ctaHref ? (
            <p className="text-sm text-[var(--muted)]">
              El botón no aparece porque falta la dirección «Responder a» del taller (Configuración → Avisos).
            </p>
          ) : null}
          <p className="text-xs text-[var(--muted)]">
            {sample.fromExample
              ? "Con datos de ejemplo (aún no hay vehículos con próxima revisión)."
              : `Con los datos de ${sample.customerFirstName} (${sample.plate}), el próximo vehículo con revisión.`}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Usa el campo oculto "kind" del formulario que lo contiene. */
function RestoreButton({ action }: { action: (formData: FormData) => void }) {
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
      <button
        type="submit"
        formAction={action}
        formNoValidate
        onClick={(e) => {
          if (!window.confirm("¿Volver a la plantilla original? Se perderá tu versión.")) e.preventDefault();
        }}
        className="self-start text-sm font-medium text-[var(--danger)] hover:underline"
      >
        Restaurar la plantilla original
      </button>
    </div>
  );
}
