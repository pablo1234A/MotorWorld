"use client";
import clsx from "clsx";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type FieldProps = { label?: ReactNode; help?: ReactNode; error?: string | null; className?: string; children: (id: string, describedBy?: string) => ReactNode };

export function Field({ label, help, error, className, children }: FieldProps) {
  const id = useId();
  const desc = error ? `${id}-err` : help ? `${id}-help` : undefined;
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={id} className="label">
          {label}
        </label>
      ) : null}
      {children(id, desc)}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-xs font-medium text-bad-600" role="alert">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="help">
          {help}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; help?: ReactNode; error?: string | null; wrapperClassName?: string };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, help, error, wrapperClassName, className, ...rest }, ref) {
  return (
    <Field label={label} help={help} error={error} className={wrapperClassName}>
      {(id, d) => <input ref={ref} id={id} aria-describedby={d} aria-invalid={error ? true : undefined} className={clsx("input", error && "input-error", className)} {...rest} />}
    </Field>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; help?: ReactNode; error?: string | null; wrapperClassName?: string };
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, help, error, wrapperClassName, className, ...rest }, ref) {
  return (
    <Field label={label} help={help} error={error} className={wrapperClassName}>
      {(id, d) => <textarea ref={ref} id={id} aria-describedby={d} aria-invalid={error ? true : undefined} className={clsx("input min-h-[96px] leading-relaxed", error && "input-error", className)} {...rest} />}
    </Field>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; help?: ReactNode; error?: string | null; wrapperClassName?: string };
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, help, error, wrapperClassName, className, children, ...rest }, ref) {
  return (
    <Field label={label} help={help} error={error} className={wrapperClassName}>
      {(id, d) => (
        <select ref={ref} id={id} aria-describedby={d} className={clsx("input appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%237A736F%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%237A736F%22 stroke-width=%221.6%22 fill=%22none%22/></svg>')] bg-[length:18px] bg-[right_10px_center] bg-no-repeat pr-9", error && "input-error", className)} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
});

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={clsx("flex cursor-pointer items-start gap-2.5 text-sm text-ink-700", className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 accent-ink-800" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; description?: ReactNode }) {
  return (
    <label className={clsx("flex items-start justify-between gap-4", disabled ? "opacity-60" : "cursor-pointer")}>
      <span>
        <span className="block text-sm font-medium text-ink-800">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-ink-500">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx("relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-ink-800" : "bg-ink-200")}
      >
        <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
    </label>
  );
}
