import type { Metadata } from "next";
import Link from "next/link";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { UploadForm } from "@/components/imports/import-forms";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import { formatDate, todayIn } from "@/lib/dates";
import { COLUMN_LABELS, IMPORT_COLUMNS, REQUIRED_COLUMNS } from "@/lib/imports/columns";
import { param } from "@/lib/pagination";
import { capabilities } from "@/server/auth/capabilities";
import { can } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { listAccessibleBranches } from "@/server/modules/branches/service";
import { listBatches } from "@/server/modules/imports/service";

export const metadata: Metadata = { title: "Importar Excel · RevisaYa" };

const STATUS: Record<string, string> = {
  validated: "Lista para confirmar",
  has_errors: "Con errores por corregir",
  committed: "Importada",
  failed: "Fallida",
  expired: "Caducada",
};

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgPage("/app/importar");
  const sp = await searchParams;
  if (!can(ctx, "imports.run")) {
    return <Alert tone="error" title="Sin permiso">Tu usuario no tiene permiso para importar archivos.</Alert>;
  }
  const caps = capabilities(ctx);
  const [batches, branches] = await Promise.all([listBatches(ctx), listAccessibleBranches(ctx)]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importar clientes y vehículos</h1>
        <p className="text-sm text-[var(--muted)]">Sube tu Excel o CSV y RevisaYa creará las fichas. Antes de guardar nada verás los errores para corregirlos.</p>
      </div>
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {param(sp.cancelada) ? <Alert tone="success">Importación descartada. No se ha guardado nada.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-lg font-semibold">1. Descarga la plantilla</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">Tiene las columnas preparadas y una fila de ejemplo que puedes borrar.</p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/app/import/template" className={buttonClass("secondary")} download>
              Plantilla Excel (.xlsx)
            </a>
            <a href="/api/app/import/template?formato=csv" className={buttonClass("ghost")} download>
              Plantilla CSV
            </a>
          </div>
          <ul className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
            {IMPORT_COLUMNS.map((c) => (
              <li key={c}>
                {COLUMN_LABELS[c]}{" "}
                <span className="text-[var(--muted)]">{REQUIRED_COLUMNS.includes(c) ? "(obligatoria)" : c === "email" ? "(para los avisos)" : "(opcional)"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Una fila por vehículo; si un cliente tiene varios, repite su correo y se agrupan. Fechas en dd/mm/aaaa. Si ya tienes un Excel parecido, puedes subirlo tal cual: reconocemos cabeceras como «Correo», «Placa» o «Km».
          </p>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-semibold">2. Sube el archivo</h2>
          {caps.customersWrite && caps.vehiclesWrite ? <UploadForm branches={branches} /> : <p className="text-sm text-[var(--muted)]">Necesitas un plan activo y permiso para crear clientes y vehículos.</p>}
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Importaciones recientes</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Todavía no has importado ningún archivo.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <Link href={`/app/importar/${b.id}`} className="font-medium text-[var(--accent)]">
                    {b.fileName}
                  </Link>
                  <p className="text-[var(--muted)]">
                    {formatDate(todayIn("Europe/Madrid", b.createdAt))} · {b.rowCount} filas
                    {branches.length > 1 ? ` · ${b.branchName}` : ""}
                    {b.status === "committed" && b.summary.committed ? ` · ${b.summary.committed.vehicles} vehículos importados` : ""}
                  </p>
                </div>
                <span className={b.status === "has_errors" ? "text-[var(--danger)]" : b.status === "committed" ? "text-[var(--success-strong)]" : ""}>
                  {STATUS[b.status] ?? b.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
