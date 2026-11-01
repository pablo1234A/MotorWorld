import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "light";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 select-none disabled:pointer-events-none disabled:opacity-55 active:translate-y-px";

const variants: Record<Variant, string> = {
  primary: "bg-navy text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] hover:bg-navy-900",
  secondary: "border border-line-strong bg-white text-navy hover:border-navy/40 hover:bg-sand/40",
  ghost: "text-navy hover:bg-sand/70",
  danger: "bg-danger text-white hover:bg-danger/90",
  light: "bg-sand text-navy-950 hover:bg-white",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-12 px-6 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "className"> & { variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
