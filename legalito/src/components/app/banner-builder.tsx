"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Field, Input, inputClass } from "@/components/ui/field";
import { buildBannerSnippet, type BannerCategory } from "@/lib/cookie-banner";
import { cn } from "@/lib/cn";

const SWATCHES = ["#1F3A5F", "#111827", "#2F5D8C", "#0F766E", "#7C3AED", "#B91C1C"];

export function BannerBuilder({ siteName, defaultPolicyUrl, categories, version }: { siteName: string; defaultPolicyUrl: string; categories: BannerCategory[]; version: string }) {
  const [color, setColor] = useState(SWATCHES[0]);
  const [position, setPosition] = useState<"bar" | "box">("bar");
  const [policyUrl, setPolicyUrl] = useState(defaultPolicyUrl);
  const [copied, setCopied] = useState<"idle" | "done" | "error">("idle");

  const snippet = useMemo(() => buildBannerSnippet({ siteName, policyUrl, categories, color, position, version }), [siteName, policyUrl, categories, color, position, version]);
  const previewHref = `/panel/banner-cookies/vista-previa?${new URLSearchParams({ color, pos: position, policy: policyUrl })}`;
  const policyValid = /^(https?:\/\/|\/)[^\s"'<>]{0,300}$/.test(policyUrl.trim());

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied("done");
      setTimeout(() => setCopied("idle"), 2500);
    } catch {
      setCopied("error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <Field id="policy-url" label="Dirección de la política de cookies" required hint={policyValid ? "Donde publiques la política de cookies generada." : undefined} error={policyValid ? undefined : "Indica una dirección que empiece por https:// o por /"}>
          <Input id="policy-url" value={policyUrl} onChange={(e) => setPolicyUrl(e.target.value)} aria-invalid={!policyValid} inputMode="url" />
        </Field>
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink">Posición</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { v: "bar" as const, t: "Barra inferior" },
              { v: "box" as const, t: "Recuadro" },
            ].map((o) => (
              <label key={o.v} className="cursor-pointer rounded-lg border border-line-strong bg-white px-3.5 py-2.5 text-sm has-[:checked]:border-navy has-[:checked]:ring-1 has-[:checked]:ring-navy has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-blue/25">
                <input type="radio" name="position" value={o.v} checked={position === o.v} onChange={() => setPosition(o.v)} className="sr-only" />
                {o.t}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-ink">Color de los botones</legend>
        <div className="flex flex-wrap items-center gap-2.5">
          {SWATCHES.map((c) => (
            <label key={c} className="cursor-pointer">
              <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} className="peer sr-only" aria-label={`Color ${c}`} />
              <span className="block h-8 w-8 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-navy peer-focus-visible:ring-3 peer-focus-visible:ring-blue/40" style={{ background: c }} />
            </label>
          ))}
          <label className="ml-1 inline-flex items-center gap-2 text-sm text-muted">
            Personalizado
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line-strong bg-white" aria-label="Color personalizado" />
          </label>
        </div>
      </fieldset>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="banner-code" className="text-sm font-medium text-ink">Código para pegar en el &lt;head&gt; de la web</label>
          <div className="flex flex-wrap gap-2">
            <a href={previewHref} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
              <ExternalLink className="h-4 w-4" aria-hidden /> Probar en una página de ejemplo
            </a>
            <button type="button" onClick={copy} className={buttonClass("primary", "sm")} aria-live="polite" disabled={!policyValid}>
              {copied === "done" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied === "done" ? "Código copiado" : "Copiar código"}
            </button>
          </div>
        </div>
        <textarea id="banner-code" readOnly value={snippet} spellCheck={false} className={cn(inputClass, "h-56 font-mono text-xs leading-relaxed")} onFocus={(e) => e.currentTarget.select()} />
        {copied === "error" && <p className="mt-1 text-xs text-danger">No se pudo copiar automáticamente: selecciona el texto y cópialo.</p>}
      </div>
    </div>
  );
}
