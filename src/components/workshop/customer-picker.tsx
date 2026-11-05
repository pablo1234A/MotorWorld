"use client";

import { useEffect, useId, useState } from "react";

interface Option {
  id: string;
  name: string;
  email: string | null;
  plates: string[];
}

/**
 * Selector de cliente con búsqueda en servidor (/api/app/customers/search).
 * Envía el id elegido en un campo oculto `name`.
 */
export function CustomerPicker({ name, branchId, excludeId, label = "Buscar cliente" }: { name: string; branchId?: string; excludeId?: string; label?: string }) {
  const inputId = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Option[]>([]);
  const [selected, setSelected] = useState<Option | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (q.trim().length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const qs = new URLSearchParams({ q });
        if (branchId) qs.set("branchId", branchId);
        const res = await fetch(`/api/app/customers/search?${qs}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results: Option[] };
        setResults(data.results.filter((r) => r.id !== excludeId));
        setStatus("idle");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [q, branchId, excludeId]);

  return (
    <div className="flex flex-col gap-1.5">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm">
          <span>
            <strong>{selected.name}</strong>
            {selected.email ? <span className="text-[var(--muted)]"> · {selected.email}</span> : null}
          </span>
          <button type="button" className="font-medium text-[var(--accent)]" onClick={() => setSelected(null)}>
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <label htmlFor={inputId} className="text-sm font-medium">
            {label}
          </label>
          <input
            id={inputId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, correo, teléfono o matrícula"
            autoComplete="off"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[15px] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
          />
          {status === "loading" ? <p className="text-sm text-[var(--muted)]">Buscando…</p> : null}
          {status === "error" ? <p className="text-sm text-[var(--danger)]">No se ha podido buscar. Inténtalo de nuevo.</p> : null}
          {q.trim().length >= 2 && status === "idle" ? (
            results.length ? (
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {results.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setSelected(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]">
                      <strong>{r.name}</strong>
                      <span className="text-[var(--muted)]">
                        {r.email ? ` · ${r.email}` : ""}
                        {r.plates.length ? ` · ${r.plates.join(", ")}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">Ningún cliente coincide.</p>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
