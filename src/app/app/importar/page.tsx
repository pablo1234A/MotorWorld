import type { Metadata } from "next";
import Link from "next/link";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { UploadForm } from "@/components/imports/import-forms";
import { PciUploadForm } from "@/components/imports/pci-import-forms";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import { formatDate, todayIn } from "@/lib/dates";
import {
  COLUMN_LABELS,
  IMPORT_COLUMNS,
  REQUIRED_COLUMNS,
} from "@/lib/imports/columns";
import {
  PCI_COLUMNS,
  PCI_IMPORT_KINDS,
  PCI_IMPORT_LABELS,
} from "@/lib/imports/pci";
import { param } from "@/lib/pagination";
import { capabilities } from "@/server/auth/capabilities";
import { can } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { listAccessibleBranches } from "@/server/modules/branches/service";
import { listBatches } from "@/server/modules/imports/service";

export const metadata: Metadata = { title: "Importar · RevisaYa" };

const KIND_LABEL: Record<string, string> = {
  customers: "Clientes",
  installations: "Instalaciones",
  equipment: "Equipos",
  vehicles: "Vehículos (etapa anterior)",
};

const STATUS: Record<string, string> = {
  validated: "Lista para confirmar",
  has_errors: "Con errores por corregir",
  committed: "Importada",
  failed: "Fallida",
  expired: "Caducada",
};

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgPage("/app/importar");
  const sp = await searchParams;
  if (!can(ctx, "imports.run")) {
    return (
      <Alert tone="error" title="Sin permiso">
        Tu usuario no tiene permiso para importar archivos.
      </Alert>
    );
  }
  const caps = capabilities(ctx);
  const [batches, branches] = await Promise.all([
    listBatches(ctx),
    listAccessibleBranches(ctx),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Importar desde Excel o CSV
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Trae tus clientes, instalaciones y equipos de otro programa. Antes de
          guardar nada verás qué se crea, qué se omite y qué errores hay. Orden
          recomendado: clientes → instalaciones → equipos.
        </p>
      </div>
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {param(sp.cancelada) ? (
        <Alert tone="success">
          Importación descartada. No se ha guardado nada.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {PCI_IMPORT_KINDS.map((k, n) => {
          const canWrite =
            k === "equipment" ? caps.equipmentWrite : caps.installationsWrite;
          return (
            <Card key={k} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">
                {n + 1}. {PCI_IMPORT_LABELS[k].title}
              </h2>
              <p className="text-sm text-[var(--muted)]">
                {PCI_IMPORT_LABELS[k].hint}
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/app/import/template?tipo=${PCI_IMPORT_LABELS[k].slug}`}
                  className={buttonClass("secondary", "!py-1.5")}
                  download
                >
                  Plantilla .xlsx
                </a>
                <a
                  href={`/api/app/import/template?tipo=${PCI_IMPORT_LABELS[k].slug}&formato=csv`}
                  className={buttonClass("ghost", "!py-1.5")}
                  download
                >
                  CSV
                </a>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Obligatorias:{" "}
                {PCI_COLUMNS[k]
                  .filter((c) => c.required)
                  .map((c) => c.label)
                  .join(", ")}
                .
              </p>
              {canWrite ? (
                <PciUploadForm kind={k} branches={branches} />
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Necesitas un plan activo y permiso para crearlos.
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <summary className="cursor-pointer font-semibold">
          Vehículos (etapa anterior de RevisaYa)
        </summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-1 text-lg font-semibold">
              1. Descarga la plantilla
            </h2>
            <p className="mb-4 text-sm text-[var(--muted)]">
              Tiene las columnas preparadas y una fila de ejemplo que puedes
              borrar.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href="/api/app/import/template"
                className={buttonClass("secondary")}
                download
              >
                Plantilla Excel (.xlsx)
              </a>
              <a
                href="/api/app/import/template?formato=csv"
                className={buttonClass("ghost")}
                download
              >
                Plantilla CSV
              </a>
            </div>
            <ul className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
              {IMPORT_COLUMNS.map((c) => (
                <li key={c}>
                  {COLUMN_LABELS[c]}{" "}
                  <span className="text-[var(--muted)]">
                    {REQUIRED_COLUMNS.includes(c)
                      ? "(obligatoria)"
                      : c === "email"
                        ? "(para los avisos)"
                        : "(opcional)"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Una fila por vehículo; si un cliente tiene varios, repite su
              correo y se agrupan. Fechas en dd/mm/aaaa. Si ya tienes un Excel
              parecido, puedes subirlo tal cual: reconocemos cabeceras como
              «Correo», «Placa» o «Km».
            </p>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-semibold">2. Sube el archivo</h2>
            {caps.customersWrite && caps.vehiclesWrite ? (
              <UploadForm branches={branches} />
            ) : (
              <p className="text-sm text-[var(--muted)]">
                Necesitas un plan activo y permiso para crear clientes y
                vehículos.
              </p>
            )}
          </Card>
        </div>
      </details>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Importaciones recientes</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Todavía no has importado ningún archivo.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {batches.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <Link
                    href={`/app/importar/${b.id}`}
                    className="font-medium text-[var(--accent)]"
                  >
                    {b.fileName}
                  </Link>
                  <p className="text-[var(--muted)]">
                    {KIND_LABEL[b.kind] ?? b.kind} ·{" "}
                    {formatDate(todayIn("Europe/Madrid", b.createdAt))} ·{" "}
                    {b.rowCount} filas
                    {branches.length > 1 ? ` · ${b.branchName}` : ""}
                    {b.status === "committed" && b.summary.committed
                      ? b.kind === "vehicles"
                        ? ` · ${b.summary.committed.vehicles} vehículos importados`
                        : ` · ${(b.summary.committed as unknown as { created: number }).created} creados`
                      : ""}
                  </p>
                </div>
                <span
                  className={
                    b.status === "has_errors"
                      ? "text-[var(--danger)]"
                      : b.status === "committed"
                        ? "text-[var(--success-strong)]"
                        : ""
                  }
                >
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
