"use client";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Spinner } from "./Spinner";
import { buttonClass, type Size, type Variant } from "./button-class";

export { buttonClass };

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = "primary", size = "md", className, children, icon }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}
