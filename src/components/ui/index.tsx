"use client";
/**
 * Small UI kit for the builder (shadcn-style: owned code on top of Radix primitives).
 * Sizes follow a 13px panel scale; every interactive element has a visible focus ring and
 * a press state.
 */
import { clsx } from "clsx";
import { Dialog as D, Tooltip as T, Tabs as Tb, DropdownMenu as M, Switch as Sw, Popover as P } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { X } from "lucide-react";

export const cn = clsx;

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-[0_1px_0_rgb(255_255_255/0.18)_inset]",
  secondary: "bg-elev text-fg border border-line hover:bg-hover hover:border-line-strong",
  outline: "border border-line text-fg hover:bg-elev",
  ghost: "text-muted hover:text-fg hover:bg-hover",
  danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
};
const sizes: Record<Size, string> = {
  xs: "h-6 px-2 text-[11px] gap-1 rounded-md",
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  md: "h-8 px-3 text-[13px] gap-2 rounded-lg",
  lg: "h-10 px-4 text-sm gap-2 rounded-lg",
  icon: "size-8 rounded-lg",
  "icon-sm": "size-7 rounded-md",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn("press inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap disabled:opacity-50", variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent", className)} />;
}

const field = "w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(field, "h-8", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(field, "min-h-20 resize-y py-2 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(field, "h-8 cursor-pointer appearance-none bg-[length:10px] bg-[right_10px_center] bg-no-repeat pr-7", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239b9ba6' fill='none' stroke-width='1.5'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});

export function Label({ children, htmlFor, hint, className }: { children: ReactNode; htmlFor?: string; hint?: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 flex items-center justify-between text-[11px] font-medium text-muted", className)}>
      <span>{children}</span>
      {hint ? <span className="font-normal text-faint">{hint}</span> : null}
    </label>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label hint={hint}>{label}</Label>
      {children}
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "ok" | "warn" | "danger"; className?: string }) {
  const tones = {
    neutral: "bg-elev text-muted border-line",
    accent: "bg-accent-soft text-[#b3a9ff] border-accent/30",
    ok: "bg-ok/10 text-ok border-ok/25",
    warn: "bg-warn/10 text-warn border-warn/25",
    danger: "bg-danger/10 text-danger border-danger/25",
  };
  return <span className={cn("inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-elev px-1 font-mono text-[10px] text-muted">{children}</kbd>;
}

// ───────── Tooltip ─────────
export function Tooltip({ content, children, side = "bottom" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Provider delayDuration={350} skipDelayDuration={150}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content side={side} sideOffset={6} className="animate-fade z-[100] rounded-md border border-line bg-elev px-2 py-1 text-[11px] text-fg shadow-[var(--shadow-pop)]">
            {content}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}

// ───────── Dialog ─────────
export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md" }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="animate-fade fixed inset-0 z-[90] bg-black/60 backdrop-blur-[2px]" />
        <D.Content className={cn("animate-pop fixed top-1/2 left-1/2 z-[91] flex max-h-[88dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-panel shadow-[var(--shadow-pop)] focus:outline-none", widths[size])}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <D.Title className="text-[15px] font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-[13px] text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Cerrar">
                <X className="size-4" />
              </Button>
            </D.Close>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// ───────── Tabs ─────────
export const Tabs = Tb.Root;
export const TabsContent = Tb.Content;
export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <Tb.List className={cn("flex gap-0.5 border-b border-line px-2", className)}>{children}</Tb.List>;
}
export function TabsTrigger({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <Tb.Trigger
      value={value}
      className={cn("press relative -mb-px flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2 text-xs font-medium text-muted hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg", className)}
    >
      {children}
    </Tb.Trigger>
  );
}

// ───────── Dropdown ─────────
export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export function MenuContent({ children, align = "end" }: { children: ReactNode; align?: "start" | "end" | "center" }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className="animate-pop z-[95] min-w-44 rounded-lg border border-line bg-elev p-1 shadow-[var(--shadow-pop)]">
        {children}
      </M.Content>
    </M.Portal>
  );
}
export function MenuItem({ children, onSelect, danger, disabled }: { children: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <M.Item disabled={disabled} onSelect={onSelect} className={cn("flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-hover", danger ? "text-danger" : "text-fg")}>
      {children}
    </M.Item>
  );
}
export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-line" />;

// ───────── Popover ─────────
export function Popover({ trigger, children, align = "start", className }: { trigger: ReactNode; children: ReactNode; align?: "start" | "center" | "end"; className?: string }) {
  return (
    <P.Root>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content align={align} sideOffset={6} className={cn("animate-pop z-[95] rounded-lg border border-line bg-elev p-3 shadow-[var(--shadow-pop)] focus:outline-none", className)}>
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

// ───────── Switch ─────────
export function Switch({ checked, onCheckedChange, id, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; label?: string }) {
  return (
    <Sw.Root id={id} aria-label={label} checked={checked} onCheckedChange={onCheckedChange} className="relative h-[18px] w-8 shrink-0 rounded-full border border-line bg-bg transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent">
      <Sw.Thumb className="block size-3 translate-x-[2px] rounded-full bg-muted transition-transform duration-150 data-[state=checked]:translate-x-[15px] data-[state=checked]:bg-white" />
    </Sw.Root>
  );
}

// ───────── Segmented control ─────────
export function Segmented<T extends string>({ value, onChange, options, className, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; title?: string }>; className?: string; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex rounded-lg border border-line bg-bg p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn("press flex h-6 flex-1 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium", value === o.value ? "bg-elev text-fg shadow-[0_0_0_1px_var(--color-line-strong)]" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-14 text-center">
      {icon ? <div className="mb-3 grid size-10 place-items-center rounded-xl bg-elev text-muted">{icon}</div> : null}
      <p className="text-sm font-medium">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-[13px] text-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
