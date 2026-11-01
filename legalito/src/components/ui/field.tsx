import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "block w-full rounded-lg border border-line-strong bg-white px-3.5 py-2.5 text-[15px] text-ink shadow-[inset_0_1px_1px_rgb(23_32_45/0.03)] transition-colors placeholder:text-subtle hover:border-navy/30 focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15 disabled:bg-sand/50 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/10";

export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required ? <span className="ml-0.5 text-danger" aria-hidden>*</span> : <span className="ml-1.5 text-xs font-normal text-subtle">(opcional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[13px] leading-snug text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "min-h-28 resize-y leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(inputClass, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%235d6878%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%235d6878%22 stroke-width=%221.6%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-[length:18px] bg-[right_12px_center] bg-no-repeat pr-10", className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ label, description, className, ...props }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-sm", className)}>
      <input type="checkbox" className="mt-0.5 h-4.5 w-4.5 shrink-0 rounded border-line-strong accent-navy" {...props} />
      <span>
        <span className="text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function FormMessage({ state }: { state?: { error?: string; message?: string } | null }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="rounded-lg border border-danger/25 bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="rounded-lg border border-success/25 bg-success-bg px-3.5 py-2.5 text-sm text-success">
        {state.message}
      </p>
    );
  return null;
}
