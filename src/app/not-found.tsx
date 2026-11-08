import Link from "next/link";

import { buttonClass } from "@/components/ui/button-styles";
import { BRAND } from "@/config/brand";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-[var(--accent)]">Error 404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Esta página no existe</h1>
        <p className="mt-2 text-[var(--muted)]">Puede que el enlace esté mal escrito o que lo que buscas se haya borrado.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/app" className={buttonClass("primary")}>
            Ir al panel
          </Link>
          <Link href="/" className={buttonClass("secondary")}>
            Web de {BRAND.name}
          </Link>
        </div>
      </div>
    </main>
  );
}
