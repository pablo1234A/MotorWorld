"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { FaqList } from "./sections";
import type { Faq } from "@/content/faqs";

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Preguntas frecuentes con búsqueda instantánea y agrupación por tema. */
export function FaqSearch({ faqs, labels }: { faqs: Faq[]; labels: Record<string, string> }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return faqs;
    return faqs.filter((f) => normalize(`${f.question} ${f.answer}`).includes(q));
  }, [faqs, query]);
  const categories = Array.from(new Set(filtered.map((f) => f.category)));

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Buscar en las preguntas frecuentes</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 h-4.5 w-4.5 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca: cancelar, cookies, abogado, descargar…"
          className="block w-full rounded-xl border border-line-strong bg-white py-3.5 pr-4 pl-11 text-[15px] shadow-[var(--shadow-soft)] placeholder:text-subtle focus:border-blue focus:ring-3 focus:ring-blue/15 focus:outline-none"
        />
      </label>
      <p className="mt-3 text-sm text-muted" aria-live="polite">
        {query ? `${filtered.length} ${filtered.length === 1 ? "resultado" : "resultados"}` : `${faqs.length} preguntas`}
      </p>
      {filtered.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-line-strong px-5 py-8 text-center text-[15px] text-muted">
          No hay resultados para «{query}». Prueba con otra palabra o escríbenos desde contacto.
        </p>
      ) : (
        <div className="mt-8 space-y-10">
          {categories.map((c) => (
            <div key={c}>
              <h2 className="mb-4 text-lg font-semibold">{labels[c] ?? c}</h2>
              <FaqList faqs={filtered.filter((f) => f.category === c)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
