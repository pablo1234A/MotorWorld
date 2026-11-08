import Link from "next/link";

import { CancelImportForm } from "@/components/imports/import-forms";
import { PciCommitForm } from "@/components/imports/pci-import-forms";
import { Badge } from "@/components/pci/badges";
import { DataTable, PageHeader, Td } from "@/components/pci/page-parts";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import { formatDate, todayIn } from "@/lib/dates";
import {
  PCI_COLUMNS,
  PCI_IMPORT_LABELS,
  type PciImportKind,
} from "@/lib/imports/pci";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { type PciBatchSummary, pciRows } from "@/server/modules/imports/pci";
import type { BatchInfo } from "@/server/modules/imports/service";

const LIST: Record<PciImportKind, string> = {
  customers: "/app/clientes",
  installations: "/app/instalaciones",
  equipment: "/app/equipos",
};

/** Revisión y confirmación de un lote PCI (clientes, instalaciones o equipos). */
export async function PciBatchView({
  batch,
  created,
}: {
  batch: BatchInfo;
  created?: string;
}) {
  const ctx = await requireOrgPage("/app/importar");
  const kind = batch.kind as PciImportKind;
  const s = batch.summary as unknown as PciBatchSummary;
  const rows = await pciRows(ctx, batch.id);
  const cols = PCI_COLUMNS[kind];
  const label = (k: string) => cols.find((c) => c.key === k)?.label ?? k;
  const shown = cols
    .filter((c) => rows.some((r) => r.values[c.key]))
    .slice(0, 6);
  const caps = capabilities(ctx);
  const canWrite =
    kind === "equipment" ? caps.equipmentWrite : caps.installationsWrite;
  const editable =
    batch.status === "validated" || batch.status === "has_errors";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/app/importar", label: "Importar" }}
        title={`Importación de ${PCI_IMPORT_LABELS[kind].title.toLowerCase()}`}
        subtitle={`${batch.fileName} · ${formatDate(todayIn("Europe/Madrid", batch.createdAt))} · ${batch.rowCount} filas`}
        badge={
          batch.status === "committed" ? (
            <Badge tone="ok">Importada</Badge>
          ) : s.errorRows ? (
            <Badge tone="bad">Con errores</Badge>
          ) : (
            <Badge tone="info">Lista para confirmar</Badge>
          )
        }
      />
      {created ? (
        <Alert tone="success">
          Importación terminada: {created}{" "}
          {Number(created) === 1 ? "ficha creada" : "fichas creadas"}.{" "}
          <Link href={LIST[kind]} className="font-medium text-[var(--accent)]">
            Ver {PCI_IMPORT_LABELS[kind].title.toLowerCase()}
          </Link>
        </Alert>
      ) : null}
      {s.unknownHeaders.length ? (
        <Alert tone="info">
          Columnas que no se importan: {s.unknownHeaders.join(", ")}.
        </Alert>
      ) : null}

      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          ["Se crearán", s.toCreate],
          ["Ya existían (se omiten)", s.duplicates],
          ["Con errores", s.errorRows],
        ].map(([t, n]) => (
          <div
            key={t as string}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <dt className="text-sm text-[var(--muted)]">{t}</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">
              {Number(n).toLocaleString("es-ES")}
            </dd>
          </div>
        ))}
      </dl>

      {editable ? (
        <Card>
          {canWrite ? (
            <PciCommitForm
              batchId={batch.id}
              toCreate={s.toCreate}
              errorRows={s.errorRows}
              repeatedFile={s.repeatedFile}
            />
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Para confirmar necesitas un plan activo y permiso para crear{" "}
              {PCI_IMPORT_LABELS[kind].title.toLowerCase()}.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
            <a
              href={`/api/app/import/${batch.id}/report`}
              className={buttonClass("ghost")}
              download
            >
              Descargar la revisión (CSV)
            </a>
            <CancelImportForm batchId={batch.id} />
          </div>
        </Card>
      ) : batch.status === "committed" ? (
        <a
          href={`/api/app/import/${batch.id}/report`}
          className={buttonClass("ghost", "self-start")}
          download
        >
          Descargar el resultado (CSV)
        </a>
      ) : null}

      <DataTable
        head={["Fila", ...shown.map((c) => c.label), "Resultado"]}
        minWidth="min-w-[900px]"
      >
        {rows.map((r) => (
          <tr
            key={r.rowNumber}
            className={r.errors.length ? "bg-[var(--danger-soft)]/40" : ""}
          >
            <Td className="tabular-nums">{r.rowNumber}</Td>
            {shown.map((c) => (
              <Td key={c.key}>
                {r.values[c.key] || (
                  <span className="text-[var(--muted)]">—</span>
                )}
              </Td>
            ))}
            <Td>
              {r.errors.length ? (
                <ul className="text-xs text-[var(--danger-strong)]">
                  {r.errors.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{label(e.column)}:</span>{" "}
                      {e.message}
                    </li>
                  ))}
                </ul>
              ) : r.action === "skip_duplicate" ? (
                <Badge tone="neutral">Ya existe: se omite</Badge>
              ) : (
                <Badge tone="ok">Se crea</Badge>
              )}
              {r.warnings.length ? (
                <ul className="mt-1 text-xs text-[var(--muted)]">
                  {r.warnings.map((w, i) => (
                    <li key={i}>
                      {label(w.column)}: {w.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
