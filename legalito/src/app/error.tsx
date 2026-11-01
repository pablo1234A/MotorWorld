"use client";

import Link from "next/link";
import { buttonClass, Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="contenido" className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-semibold text-danger">Algo ha fallado</p>
      <h1 className="mt-2 text-3xl font-semibold">No hemos podido cargar esta página</h1>
      <p className="mt-3 max-w-md text-muted">
        Hemos registrado el error. Puedes intentarlo de nuevo; si persiste, escríbenos indicando este código:
        {error.digest && <code className="mt-2 block font-mono text-sm text-ink">{error.digest}</code>}
      </p>
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>Reintentar</Button>
        <Link href="/contacto" className={buttonClass("secondary")}>
          Contactar
        </Link>
      </div>
    </main>
  );
}
