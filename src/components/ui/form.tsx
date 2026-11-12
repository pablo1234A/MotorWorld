import { ChevronDown } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink shadow-card transition-[border-color,box-shadow] placeholder:text-faint hover:border-ink/30 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 resize-y py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cn(control, "h-10 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </span>
  );
}

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={cn("size-4 shrink-0 rounded border-line-strong accent-brand", className)} {...props} />;
}

type FieldProps = {
  label: ReactNode;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: ReactNode;
};

/** Envoltorio accesible de campo: etiqueta, ayuda y error asociados por id. */
export function Field({ label, htmlFor, error, hint, required, optional, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-[13px] font-medium text-ink-soft">
        {label}
        {required ? <span className="text-brand" aria-hidden>*</span> : null}
        {optional ? <span className="font-normal text-faint">opcional</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Atributos ARIA para enlazar un control con su mensaje de error. */
export function fieldAria(id: string, error?: string) {
  return { id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined } as const;
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-[10px] border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
      {message}
    </div>
  );
}
