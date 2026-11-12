import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Logotipo tipográfico: "Anuncia" en tinta y "Pro" dentro de una etiqueta de precio
 * (con su orificio), que es el símbolo de la marca.
 */
export function Logo({ className, href = "/", size = "md" }: { className?: string; href?: string | null; size?: "sm" | "md" | "lg" }) {
  const text = { sm: "text-[17px]", md: "text-xl", lg: "text-3xl" }[size];
  const mark = (
    <span className={cn("inline-flex items-center font-display font-bold tracking-tight text-ink", text, className)} aria-label="AnunciaPro">
      <span aria-hidden>Anuncia</span>
      <span
        aria-hidden
        className="relative ml-[0.18em] inline-flex items-center rounded-[0.32em] bg-brand py-[0.05em] pl-[0.62em] pr-[0.36em] text-white"
        style={{ clipPath: "polygon(0.42em 0, 100% 0, 100% 100%, 0.42em 100%, 0 50%)" }}
      >
        <span className="absolute left-[0.3em] top-1/2 size-[0.17em] -translate-y-1/2 rounded-full bg-white/90" />
        Pro
      </span>
    </span>
  );
  if (!href) return mark;
  return (
    <Link href={href} className="inline-flex rounded-md">
      {mark}
    </Link>
  );
}
