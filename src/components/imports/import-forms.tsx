"use client";

import { useActionState, useState } from "react";

import { Button, SubmitButton } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { FormMessage } from "@/components/ui/form-state";
import { COLUMN_LABELS, IMPORT_COLUMNS, type ImportColumn } from "@/lib/imports/columns";
import { issueMessage } from "@/lib/imports/messages";
import type { Issue } from "@/lib/imports/validate";
import type { ActionState } from "@/server/actions/result";
import {
  cancelImportAction,
  commitImportAction,
  setImportOptionsAction,
  toggleImportRowAction,
  updateImportRowAction,
  uploadImportAction,
} from "@/server/modules/imports/actions";

const idle: ActionState = { status: "idle" };

export function UploadForm({ branches }: { branches: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(uploadImportAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      {branches.length > 1 ? (
        <SelectField label="Taller al que importar" name="branchId" defaultValue={branches[0]?.id}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
      ) : (
        <input type="hidden" name="branchId" value={branches[0]?.id ?? ""} />
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="import-file" className="text-sm font-medium">
          Archivo Excel (.xlsx) o CSV
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          required
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="text-sm file:mr-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--surface-2)] file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        <p className="text-sm text-[var(--muted)]">Máximo 5 MB y 2.000 filas. Todavía no se guarda nada: primero verás la revisión.</p>
      </div>
      <div>
        <SubmitButton pendingLabel="Leyendo el archivo…">Subir y revisar</SubmitButton>
      </div>
    </form>
  );
}

export function NoEmailOption({ batchId, allowNoEmail, disabled }: { batchId: string; allowNoEmail: boolean; disabled?: boolean }) {
  const [state, action] = useActionState(setImportOptionsAction, idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="allowNoEmail" value={allowNoEmail ? "false" : "true"} />
      <p className="text-sm">
        {allowNoEmail
          ? "Las filas sin correo se importan, pero esos clientes no recibirán avisos."
          : "Las filas sin correo se marcan como error: sin correo no se pueden enviar avisos."}
      </p>
      <SubmitButton variant="secondary" disabled={disabled} pendingLabel="Revalidando…">
        {allowNoEmail ? "Exigir correo" : "Importar también las filas sin correo"}
      </SubmitButton>
      {state.status === "error" ? <span className="text-sm text-[var(--danger)]">{state.message}</span> : null}
    </form>
  );
}

/** R7: completar los vehículos ya registrados en lugar de omitirlos. */
export function UpdateExistingOption({ batchId, updateExisting, duplicates, disabled }: { batchId: string; updateExisting: boolean; duplicates: number; disabled?: boolean }) {
  const [state, action] = useActionState(setImportOptionsAction, idle);
  if (!updateExisting && duplicates === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="updateExisting" value={updateExisting ? "false" : "true"} />
      <p className="text-sm">
        {updateExisting
          ? "Los vehículos que ya tienes se completan: marca y modelo si faltaban, la revisión si es más reciente, los km si son mayores y el correo o teléfono del cliente si estaba vacío. No se sobrescribe nada."
          : `${duplicates} ${duplicates === 1 ? "vehículo ya existe" : "vehículos ya existen"} en el taller y se omiten.`}
      </p>
      <SubmitButton variant="secondary" disabled={disabled} pendingLabel="Revalidando…">
        {updateExisting ? "Omitir los vehículos existentes" : "Completar los vehículos existentes con estos datos"}
      </SubmitButton>
      {state.status === "error" ? <span className="text-sm text-[var(--danger)]">{state.message}</span> : null}
    </form>
  );
}

function IssueList({ issues, tone }: { issues: Issue[]; tone: "error" | "warning" }) {
  if (!issues.length) return null;
  return (
    <ul className={`flex flex-col gap-0.5 text-xs ${tone === "error" ? "text-[var(--danger)]" : "text-[var(--warning)]"}`}>
      {issues.map((i, n) => (
        <li key={n}>
          {i.column ? <strong>{COLUMN_LABELS[i.column]}: </strong> : null}
          {issueMessage(i)}
        </li>
      ))}
    </ul>
  );
}

const ACTION_LABELS: Record<string, string> = {
  create_customer_and_vehicle: "Cliente y vehículo nuevos",
  attach_to_existing_customer: "Vehículo nuevo en cliente existente",
  skip_duplicate: "Se omite (ya existe)",
  skip_empty: "Se ignora",
  skip_excluded: "Excluida",
};

export function ImportRow({
  batchId,
  row,
  editable,
}: {
  batchId: string;
  row: { rowNumber: number; raw: Record<string, string | number | boolean | null>; errors: Issue[]; warnings: Issue[]; action: string };
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saveState, save] = useActionState(updateImportRowAction, idle);
  const [toggleState, toggle] = useActionState(toggleImportRowAction, idle);
  const excluded = row.action === "skip_excluded";
  const errorCols = new Set(row.errors.map((e) => e.column));
  const value = (c: ImportColumn) => {
    const v = row.raw[c];
    return v === null || v === undefined ? "" : String(v);
  };

  return (
    <tr className={`align-top ${excluded ? "opacity-60" : ""}`}>
      <td className="px-3 py-3 tabular-nums text-[var(--muted)]">{row.rowNumber}</td>
      <td className="px-3 py-3" colSpan={editing ? 2 : 1}>
        {editing ? (
          <form
            action={async (fd) => {
              await save(fd);
              setEditing(false);
            }}
            className="grid gap-2 sm:grid-cols-3"
          >
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="rowNumber" value={row.rowNumber} />
            {IMPORT_COLUMNS.map((c) => (
              <label key={c} className="flex flex-col gap-1 text-xs font-medium">
                {COLUMN_LABELS[c]}
                <input
                  name={c}
                  defaultValue={value(c)}
                  aria-invalid={errorCols.has(c) ? true : undefined}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm font-normal aria-[invalid=true]:border-[var(--danger)]"
                />
              </label>
            ))}
            <div className="flex gap-2 sm:col-span-3">
              <SubmitButton pendingLabel="Revalidando…">Guardar fila</SubmitButton>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-1 text-sm">
            <p>
              <strong>{value("name") || "—"}</strong> · {value("email") || <span className="text-[var(--muted)]">sin correo</span>}
              {value("phone") ? ` · ${value("phone")}` : ""}
            </p>
            <p className="text-[var(--muted)]">
              <span className="font-mono text-[var(--foreground)]">{value("plate") || "—"}</span> {[value("make"), value("model")].filter(Boolean).join(" ")} · última{" "}
              {value("lastService") || "—"} · {value("km") ? `${value("km")} km` : "sin km"}
              {value("nextService") ? ` · próxima ${value("nextService")}` : ""}
            </p>
            <IssueList issues={row.errors} tone="error" />
            <IssueList issues={row.warnings} tone="warning" />
          </div>
        )}
        {saveState.status === "error" ? <p className="text-sm text-[var(--danger)]">{saveState.message}</p> : null}
        {toggleState.status === "error" ? <p className="text-sm text-[var(--danger)]">{toggleState.message}</p> : null}
      </td>
      {!editing ? (
        <td className="px-3 py-3 text-sm">
          <p className="mb-2 text-[var(--muted)]">{ACTION_LABELS[row.action] ?? row.action}</p>
          {editable && row.action !== "skip_empty" ? (
            <div className="flex flex-wrap gap-2">
              {!excluded ? (
                <Button type="button" variant="secondary" className="!px-3 !py-1.5" onClick={() => setEditing(true)} aria-label={`Corregir fila ${row.rowNumber}`}>
                  Corregir
                </Button>
              ) : null}
              <form action={toggle}>
                <input type="hidden" name="batchId" value={batchId} />
                <input type="hidden" name="rowNumber" value={row.rowNumber} />
                <input type="hidden" name="excluded" value={excluded ? "false" : "true"} />
                <SubmitButton variant="ghost" className="!px-3 !py-1.5" pendingLabel="…" aria-label={`${excluded ? "Incluir" : "Excluir"} fila ${row.rowNumber}`}>
                  {excluded ? "Incluir" : "Excluir"}
                </SubmitButton>
              </form>
            </div>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}

export function CommitForm({ batchId, canCommit, repeatedFile, reason }: { batchId: string; canCommit: boolean; repeatedFile: boolean; reason?: string }) {
  const [state, action] = useActionState(commitImportAction, idle);
  const [repeatOk, setRepeatOk] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="batchId" value={batchId} />
      {repeatedFile ? (
        <Alert tone="warning" title="Este archivo ya se importó">
          Ya se confirmó una importación con este mismo archivo en este taller. Los vehículos que ya existen se omitirán igualmente.
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input type="checkbox" name="allowRepeat" checked={repeatOk} onChange={(e) => setRepeatOk(e.target.checked)} /> Quiero importarlo de nuevo
          </label>
        </Alert>
      ) : null}
      {!canCommit && reason ? <p className="text-sm text-[var(--muted)]">{reason}</p> : null}
      <div>
        <SubmitButton disabled={!canCommit || (repeatedFile && !repeatOk)} pendingLabel="Importando… no cierres la página">
          Confirmar importación
        </SubmitButton>
      </div>
    </form>
  );
}

export function CancelImportForm({ batchId }: { batchId: string }) {
  const [state, action] = useActionState(cancelImportAction, idle);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("¿Descartar esta importación? No se habrá guardado nada.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="batchId" value={batchId} />
      <SubmitButton variant="ghost" pendingLabel="Descartando…">
        Descartar importación
      </SubmitButton>
      {state.status === "error" ? <p className="text-sm text-[var(--danger)]">{state.message}</p> : null}
    </form>
  );
}
