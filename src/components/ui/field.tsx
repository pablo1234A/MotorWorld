"use client";

import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from "react";

const CONTROL =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] aria-[invalid=true]:border-[var(--danger)]";

interface FieldProps {
  label: string;
  name: string;
  errors?: string[];
  hint?: ReactNode;
}

// Ids únicos con useId: varios formularios de una misma página pueden tener
// campos con el mismo `name` y cada etiqueta debe apuntar a SU campo.
export function Field({ label, name, errors, hint, id, ...input }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const inputId = id ?? `f-${name}-${autoId}`;
  const describedBy = errors?.length ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input id={inputId} name={name} aria-invalid={errors?.length ? true : undefined} aria-describedby={describedBy} className={CONTROL} {...input} />
      {errors?.length ? (
        <p id={`${inputId}-error`} className="text-sm text-[var(--danger)]">
          {errors[0]}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-[var(--muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  name,
  errors,
  hint,
  id,
  children,
  ...select
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId();
  const selectId = id ?? `f-${name}-${autoId}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium">
        {label}
      </label>
      <select id={selectId} name={name} aria-invalid={errors?.length ? true : undefined} className={CONTROL} {...select}>
        {children}
      </select>
      {errors?.length ? <p className="text-sm text-[var(--danger)]">{errors[0]}</p> : hint ? <p className="text-sm text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}
