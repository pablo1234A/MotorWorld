"use client";

import clsx from "clsx";
import { Loader2, X } from "lucide-react";
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const cx = clsx;

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200 select-none",
        "disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-[15px]",
        size === "icon" && "h-9 w-9",
        variant === "primary" && "bg-accent text-white shadow-[0_0_0_1px_#ff7a5c33,0_8px_24px_-8px_#ff5a3680] hover:brightness-110",
        variant === "secondary" && "bg-panel-3 text-text border border-line-2 hover:border-[#45454f] hover:bg-[#232329]",
        variant === "outline" && "border border-line-2 text-text hover:bg-panel-2",
        variant === "ghost" && "text-muted hover:text-text hover:bg-panel-2",
        variant === "danger" && "bg-err/10 text-err border border-err/30 hover:bg-err/20",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[12px] font-medium tracking-wide text-muted uppercase">
        {children}
      </label>
      {hint && <span className="font-mono text-[11px] text-dim">{hint}</span>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        "h-10 w-full rounded-lg border border-line-2 bg-panel-2 px-3 text-sm text-text placeholder:text-dim",
        "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15 transition",
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(
        "w-full resize-y rounded-xl border border-line-2 bg-panel-2 px-3.5 py-3 text-[15px] leading-relaxed text-text placeholder:text-dim",
        "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15 transition",
        className,
      )}
      {...rest}
    />
  );
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "h-10 w-full appearance-none rounded-lg border border-line-2 bg-panel-2 bg-[length:12px] bg-[right_12px_center] bg-no-repeat px-3 pr-8 text-sm text-text",
        "focus:border-accent/60 focus:outline-none",
        className,
      )}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' stroke='%238d8d98' fill='none' stroke-width='1.5'/%3E%3C/svg%3E\")" }}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("flex cursor-pointer items-center gap-3 text-sm", disabled && "opacity-40 cursor-not-allowed")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-line-2")}
      >
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
      {label && <span className="text-text/90">{label}</span>}
    </label>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-2xl border border-line bg-panel", className)} {...rest}>
      {children}
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "err" | "accent" | "info"; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-medium tracking-wide uppercase",
        tone === "neutral" && "bg-panel-3 text-muted",
        tone === "ok" && "bg-ok/10 text-ok",
        tone === "warn" && "bg-warn/10 text-warn",
        tone === "err" && "bg-err/10 text-err",
        tone === "accent" && "bg-accent/12 text-accent",
        tone === "info" && "bg-info/10 text-info",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cx("inline-flex rounded-xl border border-line bg-panel p-1", className)}>
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cx(
            "rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all",
            value === it.id ? "bg-panel-3 text-text shadow-[inset_0_0_0_1px_#33333b]" : "text-muted hover:text-text",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        className={cx("animate-fade-up flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line-2 bg-panel shadow-2xl sm:rounded-2xl", wide ? "sm:max-w-5xl" : "sm:max-w-lg")}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-2 px-6 py-14 text-center">
      {icon && <div className="mb-4 text-dim">{icon}</div>}
      <p className="text-[15px] font-medium">{title}</p>
      {children && <p className="mt-1.5 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-2 font-mono text-[11px] tracking-[0.2em] text-accent uppercase">{eyebrow}</p>}
        <h1 className="display text-[38px] leading-[1.05] sm:text-[46px]">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-[15px] text-muted">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children, title }: { tone?: "info" | "warn" | "err" | "ok"; children: ReactNode; title?: string }) {
  return (
    <div
      className={cx(
        "rounded-xl border px-4 py-3 text-[13px] leading-relaxed",
        tone === "info" && "border-info/25 bg-info/[0.06] text-[#bcd6ff]",
        tone === "warn" && "border-warn/25 bg-warn/[0.06] text-[#f7d9a6]",
        tone === "err" && "border-err/25 bg-err/[0.07] text-[#ffb3bb]",
        tone === "ok" && "border-ok/25 bg-ok/[0.06] text-[#a8eccd]",
      )}
    >
      {title && <p className="mb-0.5 font-semibold text-text">{title}</p>}
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-4 w-4 animate-spin text-muted", className)} />;
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-muted uppercase">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
