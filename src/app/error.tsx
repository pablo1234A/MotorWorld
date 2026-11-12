"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">Algo no ha ido bien</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Hemos registrado el error. Puedes volver a intentarlo; si persiste, escríbenos desde la página de contacto.
        {error.digest ? <span className="mt-2 block font-mono text-xs text-faint">Ref.: {error.digest}</span> : null}
      </p>
      <Button className="mt-6" onClick={reset}>
        Reintentar
      </Button>
    </main>
  );
}
