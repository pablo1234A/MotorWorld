import type { ReactNode } from "react";

/** Contenedor de un texto legal con el aviso de borrador (no se afirma cumplimiento certificado). */
export function LegalShell({ title, version, complete, children }: { title: string; version: string; complete: boolean; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Versión {version}</p>
      <div role="note" className="mt-4 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-4 py-3 text-sm">
        <p className="font-semibold">Borrador pendiente de revisión jurídica</p>
        <p>
          Este texto es un modelo preparado a partir de cómo funciona el servicio. Antes de cobrar a ningún cliente debe revisarlo un abogado y
          completarse con los datos reales del titular.
          {!complete ? " Faltan datos del titular (marcados como «pendiente»)." : ""}
        </p>
      </div>
      <article className="legal mt-8 flex flex-col gap-4 text-[15px] leading-relaxed [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_td]:border-t [&_td]:border-[var(--border)] [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:py-2 [&_th]:pr-3 [&_th]:text-left [&_th]:text-sm [&_th]:text-[var(--muted)]">
        {children}
      </article>
    </main>
  );
}

export function Dato({ value, label }: { value: string | null; label: string }) {
  return value ? <strong>{value}</strong> : <mark className="rounded bg-[var(--danger-soft)] px-1 text-[var(--danger-strong)]">[pendiente: {label}]</mark>;
}
