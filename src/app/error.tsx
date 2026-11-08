"use client";

import Link from "next/link";

import { buttonClass } from "@/components/ui/button-styles";

/** Error inesperado en una página: mensaje claro, reintentar y referencia para soporte (sin detalles internos). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div role="alert" className="max-w-md text-center">
        <p className="text-sm font-semibold text-[var(--danger)]">Algo ha fallado</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">No hemos podido cargar esta página</h1>
        <p className="mt-2 text-[var(--muted)]">Tus datos están a salvo. Vuelve a intentarlo en unos segundos; si sigue pasando, escríbenos con la referencia.</p>
        {digest ? <p className="mt-2 font-mono text-xs text-[var(--muted)]">Referencia: {digest}</p> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => retry()} className={buttonClass("primary")}>
            Reintentar
          </button>
          <Link href="/app" className={buttonClass("secondary")}>
            Ir al panel
          </Link>
        </div>
      </div>
    </main>
  );
}
