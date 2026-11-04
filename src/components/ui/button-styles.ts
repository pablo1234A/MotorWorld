/** Clases de botón compartidas por componentes de servidor y de cliente. */
export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-60",
  secondary:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-2)] disabled:opacity-60",
  danger: "bg-[var(--danger)] text-white hover:opacity-90 disabled:opacity-60",
  ghost: "text-[var(--foreground)] hover:bg-[var(--surface-2)] disabled:opacity-60",
};

export function buttonClass(variant: ButtonVariant = "primary", extra = ""): string {
  return `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed ${VARIANTS[variant]} ${extra}`;
}
