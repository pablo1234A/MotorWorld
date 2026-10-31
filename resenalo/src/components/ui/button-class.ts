import clsx from "clsx";

export type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
export type Size = "sm" | "md" | "lg";

const base = "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55";
const variants: Record<Variant, string> = {
  primary: "bg-ink-800 text-white hover:bg-ink-900 active:bg-black",
  accent: "bg-star-300 text-ink-900 hover:bg-star-500",
  secondary: "border border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-cream-50",
  ghost: "text-ink-700 hover:bg-ink-100",
  danger: "bg-bad-600 text-white hover:bg-bad-700",
};
const sizes: Record<Size, string> = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-[15px]" };

export const buttonClass = (variant: Variant = "primary", size: Size = "md", className?: string) => clsx(base, variants[variant], sizes[size], className);

