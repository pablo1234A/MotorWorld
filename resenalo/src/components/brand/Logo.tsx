import clsx from "clsx";

/** Estrella del logotipo de Reseñalo (redondeada, amarillo estrella). */
export function StarMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role={title ? "img" : "presentation"} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill="#F9C440"
        d="M11.05 2.93a1.06 1.06 0 0 1 1.9 0l2.33 4.72 5.2.76c.87.12 1.22 1.2.59 1.81l-3.77 3.67.89 5.18c.15.87-.76 1.53-1.54 1.12L12 17.74l-4.65 2.45c-.78.41-1.69-.25-1.54-1.12l.89-5.18-3.77-3.67c-.63-.61-.28-1.69.59-1.81l5.2-.76 2.33-4.72Z"
      />
    </svg>
  );
}

/** Logotipo tipográfico: estrella + «Reseñalo» en Poppins ExtraBold. */
export function Logo({ className, size = "md", tagline = false }: { className?: string; size?: "sm" | "md" | "lg"; tagline?: boolean }) {
  const s = { sm: "text-lg", md: "text-xl", lg: "text-3xl" }[size];
  const star = { sm: "h-5 w-5", md: "h-6 w-6", lg: "h-9 w-9" }[size];
  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)} aria-label="Reseñalo">
      <StarMark className={clsx(star, "-mt-0.5 shrink-0")} />
      <span className={clsx("font-display font-extrabold tracking-[-0.03em] text-ink-800", s)}>Reseñalo</span>
      {tagline ? <span className="ml-1 hidden self-start font-display text-[10px] font-semibold uppercase tracking-wider text-ink-500 sm:inline">más reseñas</span> : null}
    </span>
  );
}
