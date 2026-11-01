"use client";

import { useState } from "react";
import { Check, Code2, Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

/** Copia al portapapeles el código HTML del documento, listo para pegar en la web. */
export function CopyHtmlButton({ versionId }: { versionId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const copy = async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/documentos/${versionId}/fragmento`);
      if (!res.ok) throw new Error(String(res.status));
      await navigator.clipboard.writeText(await res.text());
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={copy} disabled={state === "loading"} className={buttonClass("ghost", "sm")} aria-live="polite">
        {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "done" ? <Check className="h-4 w-4 text-success" /> : <Code2 className="h-4 w-4" />}
        {state === "done" ? "Código copiado" : "Copiar código HTML"}
      </button>
      {state === "error" && <span className="text-xs text-danger">No se pudo copiar. Descarga el HTML.</span>}
    </span>
  );
}
