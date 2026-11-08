"use client";

import { useActionState, useMemo, useState } from "react";

import { Button, SubmitButton } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { Card } from "@/components/ui/feedback";
import { fieldErrors, FormMessage } from "@/components/ui/form-state";
import { formatEuro, lineAmounts, parseDecimalInput, quoteTotals, TAX_RATES } from "@/lib/quotes/money";
import type { ActionState } from "@/server/actions/result";
import {
  decideQuoteAction,
  deleteQuoteAction,
  duplicateQuoteAction,
  emailQuoteAction,
  issueQuoteAction,
  saveQuoteAction,
} from "@/server/modules/quotes/actions";

const idle: ActionState = { status: "idle" };
const INPUT =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] aria-[invalid=true]:border-[var(--danger)]";

export interface EditorLine {
  lineKind?: "service" | "material" | "other";
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: number;
}

const emptyLine = (): EditorLine => ({ lineKind: "service", description: "", quantity: "1", unitPrice: "", taxRate: 21 });
const LINE_KINDS = [
  ["service", "Servicio"],
  ["material", "Material"],
  ["other", "Otro"],
] as const;

/** Cifras con coma decimal para mostrar en los campos ("4.5" → "4,5"). */
const toInput = (v: string) => v.replace(".", ",");

export function QuoteEditor({
  id,
  customer,
  vehicles,
  installations = [],
  initial,
}: {
  id?: string;
  customer: { id: string; name: string };
  vehicles: Array<{ id: string; label: string }>;
  installations?: Array<{ id: string; label: string }>;
  initial: { vehicleId: string | null; installationId?: string | null; issueDate: string; validUntil: string; notes: string | null; items: EditorLine[] };
}) {
  const [state, action] = useActionState(saveQuoteAction, idle);
  const [lines, setLines] = useState<EditorLine[]>(initial.items.length ? initial.items.map((l) => ({ ...l, quantity: toInput(l.quantity), unitPrice: toInput(l.unitPrice) })) : [emptyLine()]);

  const parsed = lines.map((l) => ({ q: parseDecimalInput(l.quantity, 3), p: parseDecimalInput(l.unitPrice, 2), rate: l.taxRate }));
  const totals = useMemo(
    () => quoteTotals(parsed.filter((x) => x.q !== null && x.p !== null && Number(x.q) > 0).map((x) => ({ quantity: x.q!, unitPrice: x.p!, taxRate: x.rate }))),
    [parsed],
  );
  const set = (i: number, patch: Partial<EditorLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const lineError = (i: number, f: string) => fieldErrors(state, `items.${i}.${f}`)?.[0];

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormMessage state={state} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <input type="hidden" name="customerId" value={customer.id} />
      <input type="hidden" name="items" value={JSON.stringify(lines)} />

      <Card className="flex flex-col gap-4">
        <p className="text-sm">
          Cliente: <strong>{customer.name}</strong>
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Instalación" name="installationId" defaultValue={initial.installationId ?? ""} errors={fieldErrors(state, "installationId")}>
            <option value="">Sin instalación concreta</option>
            {installations.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </SelectField>
          {vehicles.length ? (
            <SelectField label="Vehículo (etapa anterior)" name="vehicleId" defaultValue={initial.vehicleId ?? ""}>
              <option value="">Sin vehículo</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </SelectField>
          ) : null}
          <Field label="Fecha" name="issueDate" type="date" required defaultValue={initial.issueDate} errors={fieldErrors(state, "issueDate")} />
          <Field label="Válido hasta" name="validUntil" type="date" required defaultValue={initial.validUntil} errors={fieldErrors(state, "validUntil")} />
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Conceptos</h2>
        {fieldErrors(state, "items") ? <p className="text-sm text-[var(--danger)]">{fieldErrors(state, "items")![0]}</p> : null}
        <div className="flex flex-col gap-3">
          {lines.map((l, i) => {
            const p = parsed[i];
            const amounts = p.q && p.p ? lineAmounts({ quantity: p.q, unitPrice: p.p, taxRate: l.taxRate }) : null;
            return (
              <div key={i} className="grid gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-[7rem_1fr_6rem_8rem_6rem_7rem_auto] sm:items-start">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--muted)]">Tipo</span>
                  <select aria-label={`Tipo ${i + 1}`} value={l.lineKind ?? "service"} onChange={(e) => set(i, { lineKind: e.target.value as EditorLine["lineKind"] })} className={INPUT}>
                    {LINE_KINDS.map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--muted)]">Concepto {i + 1}</span>
                  <input aria-label={`Concepto ${i + 1}`} value={l.description} maxLength={300} onChange={(e) => set(i, { description: e.target.value })} className={INPUT} aria-invalid={lineError(i, "description") ? true : undefined} placeholder="Mantenimiento anual de extintores" />
                  {lineError(i, "description") ? <span className="text-[var(--danger)]">{lineError(i, "description")}</span> : null}
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--muted)]">Cantidad</span>
                  <input aria-label={`Cantidad ${i + 1}`} inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} className={INPUT} aria-invalid={lineError(i, "quantity") || (l.quantity && !p.q) ? true : undefined} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--muted)]">Precio sin IVA (€)</span>
                  <input aria-label={`Precio ${i + 1}`} inputMode="decimal" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} className={INPUT} aria-invalid={lineError(i, "unitPrice") || (l.unitPrice && !p.p) ? true : undefined} placeholder="0,00" />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--muted)]">IVA</span>
                  <select aria-label={`IVA ${i + 1}`} value={l.taxRate} onChange={(e) => set(i, { taxRate: Number(e.target.value) })} className={INPUT}>
                    {TAX_RATES.map((r) => (
                      <option key={r} value={r}>
                        {r} %
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--muted)]">Importe</span>
                  <span className="py-2 text-sm font-medium tabular-nums">{amounts ? formatEuro(amounts.subtotal) : "—"}</span>
                </div>
                <button type="button" onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : [emptyLine()])} className="self-end py-2 text-sm text-[var(--danger)]" aria-label={`Quitar concepto ${i + 1}`}>
                  Quitar
                </button>
              </div>
            );
          })}
        </div>
        <div>
          <Button type="button" variant="secondary" onClick={() => setLines([...lines, emptyLine()])} disabled={lines.length >= 200}>
            Añadir concepto
          </Button>
        </div>
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt>Base imponible</dt>
            <dd className="tabular-nums">{formatEuro(totals.subtotal)}</dd>
          </div>
          {totals.byRate.map((r) => (
            <div key={r.rate} className="flex justify-between text-[var(--muted)]">
              <dt>IVA {r.rate} %</dt>
              <dd className="tabular-nums">{formatEuro(r.tax)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums" data-testid="quote-total">
              {formatEuro(totals.total)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-medium">
          Observaciones (aparecen en el PDF)
        </label>
        <textarea id="notes" name="notes" rows={3} maxLength={5000} defaultValue={initial.notes ?? ""} className={INPUT} placeholder="Forma de pago, plazo de entrega…" />
      </Card>
      <div>
        <SubmitButton>{id ? "Guardar borrador" : "Crear borrador"}</SubmitButton>
      </div>
    </form>
  );
}

export function IssueQuoteForm({ id, hasEmail, taxDataMissing }: { id: string; hasEmail: boolean; taxDataMissing: boolean }) {
  const [state, action] = useActionState(issueQuoteAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      {taxDataMissing ? (
        <p className="text-sm text-[var(--warning)]">Faltan los datos fiscales del taller (razón social y NIF). Puedes añadirlos en Configuración → Datos del taller antes de emitirlo.</p>
      ) : null}
      <p className="text-sm text-[var(--muted)]">Al emitirlo se numera definitivamente, se guarda el PDF y ya no se puede modificar.</p>
      <div className="flex flex-wrap gap-3">
        {hasEmail ? (
          <SubmitButton name="send" value="true" pendingLabel="Emitiendo…">
            Emitir y enviar al cliente
          </SubmitButton>
        ) : null}
        <SubmitButton name="send" value="false" variant={hasEmail ? "secondary" : "primary"} pendingLabel="Emitiendo…">
          {hasEmail ? "Emitir sin enviar" : "Emitir"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function QuoteActions({ id, status, hasEmail, canDelete }: { id: string; status: string; hasEmail: boolean; canDelete: boolean }) {
  const [emailState, sendEmail] = useActionState(emailQuoteAction, idle);
  const [decisionState, decide] = useActionState(decideQuoteAction, idle);
  const [dupState, duplicate] = useActionState(duplicateQuoteAction, idle);
  const [delState, remove] = useActionState(deleteQuoteAction, idle);
  return (
    <div className="flex flex-col gap-3">
      <FormMessage state={emailState} />
      <FormMessage state={decisionState} />
      <FormMessage state={dupState} />
      <FormMessage state={delState} />
      <div className="flex flex-wrap gap-3">
        {status !== "draft" && hasEmail ? (
          <form action={sendEmail}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton variant="secondary" pendingLabel="Enviando…">
              {status === "sent" ? "Enviar por correo" : "Volver a enviar"}
            </SubmitButton>
          </form>
        ) : null}
        {status === "sent" ? (
          <form action={decide} className="flex gap-3">
            <input type="hidden" name="id" value={id} />
            <SubmitButton name="decision" value="accepted" variant="secondary" pendingLabel="Guardando…">
              Aceptado
            </SubmitButton>
            <SubmitButton name="decision" value="rejected" variant="ghost" pendingLabel="Guardando…">
              Rechazado
            </SubmitButton>
          </form>
        ) : null}
        <form action={duplicate}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="ghost" pendingLabel="Duplicando…">
            Duplicar
          </SubmitButton>
        </form>
        {status === "draft" && canDelete ? (
          <form
            action={remove}
            onSubmit={(e) => {
              if (!window.confirm("¿Borrar este borrador?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={id} />
            <SubmitButton variant="ghost" pendingLabel="Borrando…">
              Borrar borrador
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
