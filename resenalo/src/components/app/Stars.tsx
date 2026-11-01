import clsx from "clsx";
import { Star } from "lucide-react";

export function Stars({ n, className }: { n: number; className?: string }) {
  return (
    <span className={clsx("inline-flex", className)} role="img" aria-label={`${n} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={clsx("h-4 w-4", i <= n ? "fill-star-300 text-star-300" : "text-ink-200")} aria-hidden />)}
    </span>
  );
}
