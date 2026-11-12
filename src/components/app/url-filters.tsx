"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/** Estado de filtros guardado en la URL: compartible, recargable y resuelto en servidor. */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParams = useCallback(
    (changes: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!("page" in changes)) next.delete("page"); // cualquier cambio de filtro vuelve a la página 1
      const query = next.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  return { get: (key: string) => searchParams.get(key) ?? "", setParams, pending };
}

/** Buscador con debounce (350 ms) que sincroniza el término con el parámetro ?q= */
export function SearchInput({ placeholder, className }: { placeholder: string; className?: string }) {
  const { get, setParams, pending } = useUrlFilters();
  const current = get("q");
  const [value, setValue] = useState(current);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSent = useRef(current);

  useEffect(() => {
    // Sincroniza si la URL cambia desde fuera (atrás/adelante del navegador).
    if (current !== lastSent.current) {
      lastSent.current = current;
      setValue(current);
    }
  }, [current]);

  function update(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastSent.current = next.trim();
      setParams({ q: next.trim() || undefined });
    }, 350);
  }

  return (
    <div className={cn("relative", className)}>
      <Search className={cn("pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint", pending && "animate-pulse text-brand")} aria-hidden />
      <Input data-search-input type="search" value={value} onChange={(event) => update(event.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden" maxLength={120} />
      {value ? (
        <button type="button" onClick={() => update("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:bg-sunken" aria-label="Borrar búsqueda">
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function FilterSelect({ param, label, options, allLabel, className }: { param: string; label: string; options: { value: string; label: string }[]; allLabel?: string; className?: string }) {
  const { get, setParams } = useUrlFilters();
  return (
    <div className={className}>
      <Select aria-label={label} value={get(param)} onChange={(event) => setParams({ [param]: event.target.value || undefined })}>
        {allLabel ? <option value="">{allLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
