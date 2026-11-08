"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-state";
import type { PciImportKind } from "@/lib/imports/pci";
import type { ActionState } from "@/server/actions/result";
import {
  commitPciImportAction,
  uploadPciImportAction,
} from "@/server/modules/imports/actions";

const idle: ActionState = { status: "idle" };

export function PciUploadForm({
  kind,
  branches,
}: {
  kind: PciImportKind;
  branches: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState(uploadPciImportAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="kind" value={kind} />
      {branches.length > 1 ? (
        <SelectField
          label="Delegación"
          name="branchId"
          defaultValue={branches[0]?.id}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
      ) : (
        <input type="hidden" name="branchId" value={branches[0]?.id ?? ""} />
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Archivo Excel (.xlsx) o CSV
        <input
          name="file"
          type="file"
          required
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="text-sm font-normal file:mr-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--surface-2)] file:px-3 file:py-2 file:text-sm file:font-medium"
        />
      </label>
      <SubmitButton
        variant="secondary"
        pendingLabel="Leyendo el archivo…"
        className="self-start"
      >
        Subir y revisar
      </SubmitButton>
    </form>
  );
}

export function PciCommitForm({
  batchId,
  toCreate,
  errorRows,
  repeatedFile,
}: {
  batchId: string;
  toCreate: number;
  errorRows: number;
  repeatedFile: boolean;
}) {
  const [state, action] = useActionState(commitPciImportAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="batchId" value={batchId} />
      {errorRows ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="skipErrors" className="mt-0.5" />
          Importar solo las {toCreate} filas correctas y omitir las {errorRows}{" "}
          con errores
        </label>
      ) : null}
      {repeatedFile ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="allowRepeat" className="mt-0.5" />
          Este archivo ya se importó antes: importarlo de nuevo igualmente
        </label>
      ) : null}
      <SubmitButton
        pendingLabel="Importando…"
        className="self-start"
        disabled={toCreate === 0}
      >
        Confirmar e importar {toCreate} {toCreate === 1 ? "fila" : "filas"}
      </SubmitButton>
      <p className="text-xs text-[var(--muted)]">
        Se crean todas o ninguna. Lo importado queda marcado con este lote.
      </p>
    </form>
  );
}
