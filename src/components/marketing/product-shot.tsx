import Image from "next/image";
import { cn } from "@/lib/utils";

/** Captura real de la aplicación dentro de un marco de ventana. */
export function ProductShot({ src, alt, className, priority }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <figure className={cn("overflow-hidden rounded-2xl bg-surface shadow-raised ring-1 ring-ink/10", className)}>
      <div className="flex h-9 items-center gap-1.5 border-b border-line bg-paper px-4" aria-hidden>
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="ml-3 h-5 flex-1 max-w-64 rounded-md bg-sunken" />
      </div>
      <Image src={src} alt={alt} width={2560} height={1600} sizes="(min-width: 1024px) 640px, 100vw" priority={priority} className="block h-auto w-full" />
    </figure>
  );
}
