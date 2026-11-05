"use client";

import { useActionState, useId, useState } from "react";

import { Button, SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { fieldErrors, FormMessage, sentValue } from "@/components/ui/form-state";
import type { ActionState } from "@/server/actions/result";
import { createRecordAction, deleteRecordAction, updateRecordAction } from "@/server/modules/workshop/actions";

const idle: ActionState = { status: "idle" };

interface PartRow {
  key: number;
  description: string;
  reference: string;
  quantity: string;
}

export interface MaintenanceValues {
  recordId?: string;
  serviceDate?: string;
  km?: number | null;
  workPerformed?: string;
  notes?: string | null;
  nextRecommendedDate?: string | null;
  nextRecommendedKm?: number | null;
  parts?: Array<{ description: string; reference: string | null; quantity: string }>;
}

let seq = 0;
const row = (p?: Partial<PartRow>): PartRow => ({ key: ++seq, description: "", reference: "", quantity: "1", ...p });

/** Alta o edición de una revisión con su lista de piezas. */
export function MaintenanceForm({ vehicleId, today, values = {} }: { vehicleId: string; today: string; values?: MaintenanceValues }) {
  const editing = Boolean(values.recordId);
  const [state, action] = useActionState(editing ? updateRecordAction : createRecordAction, idle);
  const [parts, setParts] = useState<PartRow[]>(() =>
    values.parts?.length ? values.parts.map((p) => row({ description: p.description, reference: p.reference ?? "", quantity: String(Number(p.quantity)) })) : [],
  );
  const v = (n: keyof MaintenanceValues, f?: string | number | null) => sentValue(state, n) ?? (f == null ? "" : String(f));
  const uid = useId();

  return (
    <form
      action={async (fd) => {
        await action(fd);
        if (!editing) setParts([]);
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <FormMessage state={state} />
      <input type="hidden" name="vehicleId" value={vehicleId} />
      {values.recordId ? <input type="hidden" name="recordId" value={values.recordId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha de la revisión" name="serviceDate" type="date" required max={today} defaultValue={v("serviceDate", values.serviceDate ?? today)} errors={fieldErrors(state, "serviceDate")} />
        <Field label="Kilómetros" name="km" type="number" inputMode="numeric" min={0} defaultValue={v("km", values.km)} errors={fieldErrors(state, "km")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`work-${uid}`} className="text-sm font-medium">
          Trabajos realizados
        </label>
        <textarea
          id={`work-${uid}`}
          name="workPerformed"
          rows={3}
          required
          maxLength={5000}
          defaultValue={v("workPerformed", values.workPerformed)}
          aria-invalid={fieldErrors(state, "workPerformed") ? true : undefined}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[15px] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
          placeholder="Cambio de aceite y filtros, revisión de frenos…"
        />
        {fieldErrors(state, "workPerformed") ? <p className="text-sm text-[var(--danger)]">{fieldErrors(state, "workPerformed")?.[0]}</p> : null}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Piezas utilizadas</legend>
        {parts.map((p, i) => (
          <div key={p.key} className="grid gap-2 sm:grid-cols-[1fr_10rem_6rem_auto] sm:items-end">
            <Field label={`Pieza ${i + 1}`} name="partDescription" defaultValue={p.description} placeholder="Filtro de aceite" />
            <Field label="Referencia" name="partReference" defaultValue={p.reference} />
            <Field label="Cantidad" name="partQuantity" type="number" step="0.001" min={0.001} defaultValue={p.quantity} />
            <Button type="button" variant="ghost" onClick={() => setParts((rows) => rows.filter((r) => r.key !== p.key))} aria-label={`Quitar pieza ${i + 1}`}>
              Quitar
            </Button>
          </div>
        ))}
        {fieldErrors(state, "parts") ? <p className="text-sm text-[var(--danger)]">Revisa las piezas: {fieldErrors(state, "parts")?.[0]}</p> : null}
        <div>
          <Button type="button" variant="secondary" onClick={() => setParts((rows) => [...rows, row()])}>
            Añadir pieza
          </Button>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`notes-${uid}`} className="text-sm font-medium">
          Observaciones
        </label>
        <textarea
          id={`notes-${uid}`}
          name="notes"
          rows={2}
          maxLength={5000}
          defaultValue={v("notes", values.notes)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[15px] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Próxima revisión recomendada"
          name="nextRecommendedDate"
          type="date"
          defaultValue={v("nextRecommendedDate", values.nextRecommendedDate)}
          errors={fieldErrors(state, "nextRecommendedDate")}
          hint="Si la dejas vacía, se calcula con el intervalo del taller."
        />
        <Field
          label="Próxima revisión a los (km)"
          name="nextRecommendedKm"
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={v("nextRecommendedKm", values.nextRecommendedKm)}
          errors={fieldErrors(state, "nextRecommendedKm")}
        />
      </div>
      <div>
        <SubmitButton pendingLabel="Guardando…">{editing ? "Guardar cambios" : "Registrar revisión"}</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteRecordButton({ id, date }: { id: string; date: string }) {
  const [state, action] = useActionState(deleteRecordAction, idle);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`¿Eliminar la revisión del ${date} del historial? Esta acción queda registrada.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" pendingLabel="…" className="!px-2 !py-1 text-[var(--danger)]">
        Eliminar
      </SubmitButton>
      {state.status === "error" ? <p className="text-sm text-[var(--danger)]">{state.message}</p> : null}
    </form>
  );
}
