import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  CancelImportForm,
  CommitForm,
  ImportRow,
  NoEmailOption,
  UpdateExistingOption,
} from "@/components/imports/import-forms";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, todayIn } from "@/lib/dates";
import { param, parsePage } from "@/lib/pagination";
import { capabilities } from "@/server/auth/capabilities";
import { can } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import {
  checkLimits,
  getBatch,
  listRows,
  type RowFilter,
} from "@/server/modules/imports/service";

import { PciBatchView } from "./pci-batch";

export const metadata: Metadata = {
  title: "Revisión de la importación · RevisaYa",
};

const PAGE = 50;

export default async function ImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgPage("/app/importar");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !can(ctx, "imports.run")) notFound();
  const batch = await getBatch(ctx, id);
  if (!batch || batch.status === "canceled") notFound();
  if (batch.kind !== "vehicles")
    return <PciBatchView batch={batch} created={param(sp.creados)} />;

  const s = batch.summary;
  const editable =
    batch.status === "validated" || batch.status === "has_errors";
  const filterParam = param(sp.ver);
  const filter: RowFilter =
    filterParam === "errores"
      ? "errors"
      : filterParam === "avisos"
        ? "warnings"
        : filterParam === "todas"
          ? "all"
          : s.withErrors
            ? "errors"
            : "all";
  const [rows, limits] = await Promise.all([
    listRows(ctx, id, {
      filter,
      page: parsePage(param(sp.pagina)),
      pageSize: PAGE,
    }),
    editable
      ? checkLimits(ctx, ctx.subscription.planCode, s)
      : Promise.resolve(null),
  ]);
  const caps = capabilities(ctx);
  const canWrite =
    caps.customersWrite && caps.vehiclesWrite && caps.maintenanceWrite;

  let blocker: string | undefined;
  if (!canWrite)
    blocker =
      "Para confirmar necesitas un plan activo y permiso para crear clientes, vehículos y revisiones.";
  else if (s.withErrors > 0)
    blocker = `Corrige o excluye las ${s.withErrors} filas con errores para poder confirmar.`;
  else if (s.newVehicles + (s.updatedVehicles ?? 0) === 0)
    blocker = "No hay ninguna fila que importar.";
  else if (limits && !limits.ok)
    blocker =
      "La importación supera el límite de tu plan. Excluye filas o mejora el plan.";

  const tab = (key: string, label: string, count: number) => (
    <Link
      href={`/app/importar/${id}?ver=${key}`}
      className={`rounded-lg px-3 py-1.5 text-sm ${(filterParam ?? (s.withErrors ? "errores" : "todas")) === key ? "bg-[var(--surface-2)] font-semibold" : "hover:bg-[var(--surface-2)]"}`}
    >
      {label} ({count})
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/importar" className="text-sm text-[var(--accent)]">
          ← Importar
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {batch.fileName}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {batch.rowCount} filas · subido el{" "}
          {formatDate(todayIn("Europe/Madrid", batch.createdAt))} ·{" "}
          {batch.branchName}
          {editable
            ? ` · caduca el ${formatDate(todayIn("Europe/Madrid", batch.expiresAt))}`
            : ""}
        </p>
      </div>

      {batch.status === "committed" ? (
        <Alert
          tone="success"
          title={
            param(sp.confirmada)
              ? "Importación completada"
              : "Importación confirmada"
          }
        >
          Se han creado {s.committed?.customers ?? 0} clientes y{" "}
          {s.committed?.vehicles ?? 0} vehículos con su última revisión
          {s.committed?.attachedCustomers
            ? `, y se han añadido vehículos a ${s.committed.attachedCustomers} clientes que ya existían`
            : ""}
          {s.committed?.updatedVehicles
            ? `; se han completado ${s.committed.updatedVehicles} vehículos que ya tenías`
            : ""}
          . Los avisos se programarán según la configuración de la empresa.{" "}
          <Link
            href="/app/clientes"
            className="font-medium text-[var(--accent)]"
          >
            Ver clientes
          </Link>
        </Alert>
      ) : null}
      {s.unknownHeaders.length ? (
        <Alert tone="info">
          Columnas que no se importan: {s.unknownHeaders.join(", ")}.
        </Alert>
      ) : null}

      <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Filas", s.rows],
          ["Con errores", s.withErrors],
          ["Con avisos", s.withWarnings],
          ["Clientes nuevos", s.newCustomers],
          ["Vehículos nuevos", s.newVehicles],
          ...(s.updatedVehicles
            ? ([["Vehículos a completar", s.updatedVehicles]] as Array<
                [string, number]
              >)
            : []),
          ["Omitidas", s.duplicatesSkipped + s.empty + s.excluded],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <dt className="text-xs text-[var(--muted)]">{label}</dt>
            <dd
              className={`mt-1 text-2xl font-semibold tabular-nums ${label === "Con errores" && Number(value) > 0 ? "text-[var(--danger)]" : ""}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {s.existingCustomers ? (
        <p className="text-sm text-[var(--muted)]">
          {s.existingCustomers} filas se añaden a clientes que ya tienes (mismo
          correo).
        </p>
      ) : null}

      {editable && limits && !limits.ok ? (
        <Alert tone="error" title="Supera el límite del plan">
          {limits.customersAvailable !== null &&
          limits.customersNew > limits.customersAvailable
            ? `Esta importación crea ${limits.customersNew} clientes y tu plan permite ${limits.customersAvailable} más. `
            : ""}
          {limits.vehiclesAvailable !== null &&
          limits.vehiclesNew > limits.vehiclesAvailable
            ? `Crea ${limits.vehiclesNew} vehículos y tu plan permite ${limits.vehiclesAvailable} activos más.`
            : ""}
        </Alert>
      ) : null}

      {editable ? (
        <Card>
          <div className="flex flex-col gap-4">
            <NoEmailOption batchId={id} allowNoEmail={s.options.allowNoEmail} />
            <UpdateExistingOption
              batchId={id}
              updateExisting={s.options.updateExisting ?? false}
              duplicates={s.duplicatesSkipped}
            />
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/app/import/${id}/report`}
                className={buttonClass("secondary")}
                download
              >
                Descargar informe de errores (CSV)
              </a>
              <a
                href={`/api/app/import/${id}/report?formato=xlsx`}
                className={buttonClass("ghost")}
                download
              >
                Informe en Excel
              </a>
            </div>
            <p className="text-sm text-[var(--muted)]">
              Corrige las filas aquí o arregla tu archivo y vuelve a subirlo. Al
              confirmar se guarda todo de una vez: si algo fallase, no se
              guardaría nada.
            </p>
            <CommitForm
              batchId={id}
              canCommit={!blocker}
              repeatedFile={s.repeatedFile}
              reason={blocker}
            />
            <CancelImportForm batchId={id} />
          </div>
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Filtrar filas">
          {tab("errores", "Con errores", s.withErrors)}
          {tab("avisos", "Con avisos", s.withWarnings)}
          {tab("todas", "Todas", s.rows)}
        </nav>
        {rows.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
            No hay filas en esta vista.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Fila</th>
                  <th className="px-3 py-2 font-medium">Datos</th>
                  <th className="px-3 py-2 font-medium">Qué se hará</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.rows.map((r) => (
                  <ImportRow
                    key={r.rowNumber}
                    batchId={id}
                    row={r}
                    editable={editable && canWrite}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={rows}
          basePath={`/app/importar/${id}`}
          params={{ ver: filterParam }}
        />
      </section>
    </div>
  );
}
