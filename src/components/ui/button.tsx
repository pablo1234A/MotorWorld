import { Loader2 } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0";

const variants = {
  primary: "bg-ink text-white shadow-card hover:bg-ink-soft",
  brand: "bg-brand text-white shadow-card hover:bg-brand-strong",
  secondary: "border border-line-strong bg-surface text-ink shadow-card hover:border-ink/30 hover:bg-sunken/60",
  ghost: "text-ink-soft hover:bg-sunken",
  danger: "bg-danger text-white shadow-card hover:bg-danger/90",
  "danger-ghost": "text-danger hover:bg-danger-soft",
  link: "h-auto! p-0! text-brand-strong underline-offset-4 hover:underline",
} as const;

const sizes = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
  icon: "size-9",
} as const;

export type ButtonVariant = keyof typeof variants;
type Shared = { variant?: ButtonVariant; size?: keyof typeof sizes; className?: string; children?: ReactNode };

export function buttonClass({ variant = "primary", size = "md", className }: Shared = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = Shared & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean };

export function Button({ variant, size, className, loading, disabled, children, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={buttonClass({ variant, size, className })} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, className, children, ...props }: Shared & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
