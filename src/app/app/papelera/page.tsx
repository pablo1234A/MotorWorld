import type { Metadata } from "next";
import Link from "next/link";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { Alert, Card } from "@/components/ui/feedback";
import { RestoreButton } from "@/components/workshop/restore-button";
import { addDays, formatDate, todayIn } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listTrash, RETENTION_DAYS } from "@/server/modules/trash/service";

export const metadata: Metadata = { title: "Papelera · RevisaYa" };

function purgeDate(deletedAt: Date): string {
  return formatDate(addDays(todayIn("Europe/Madrid", deletedAt), RETENTION_DAYS));
}

export default async function TrashPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgPage("/app/papelera");
  const sp = await searchParams;
  const restored = param(sp.restaurado);
  const restoredVehicles = Number(param(sp.vehiculos) ?? 0);
  const caps = capabilities(ctx);
  if (!caps.customersDelete && !caps.vehiclesDelete && !caps.readOnly) {
    return <Alert tone="error" title="Sin permiso">Necesitas permiso para borrar clientes o vehículos para ver la papelera.</Alert>;
  }
  const { customers, vehicles } = await listTrash(ctx);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/clientes" className="text-sm text-[var(--accent)]">
          ← Clientes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Papelera</h1>
        <p className="text-sm text-[var(--muted)]">
          Lo que se borra se puede restaurar durante {RETENTION_DAYS} días. Después se elimina definitivamente, con su historial.
        </p>
      </div>
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {restored === "cliente" ? (
        <Alert tone="success">
          {restoredVehicles > 0
            ? `Cliente restaurado con ${restoredVehicles} ${restoredVehicles === 1 ? "vehículo" : "vehículos"}.`
            : "Cliente restaurado."}
        </Alert>
      ) : restored === "vehiculo" ? (
        <Alert tone="success">Vehículo restaurado.</Alert>
      ) : null}

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Clientes borrados ({customers.length})</h2>
        {customers.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No hay clientes en la papelera.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {customers.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="text-sm">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-[var(--muted)]">
                    {c.email ?? "Sin correo"} · {c.vehicles} {c.vehicles === 1 ? "vehículo" : "vehículos"} · borrado el {formatDate(todayIn("Europe/Madrid", c.deletedAt))} ·
                    se eliminará el {purgeDate(c.deletedAt)}
                  </p>
                </div>
                {caps.customersDelete ? <RestoreButton id={c.id} kind="customer" /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Vehículos borrados ({vehicles.length})</h2>
        {vehicles.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No hay vehículos en la papelera.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {vehicles.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="text-sm">
                  <p>
                    <span className="font-mono font-semibold">{v.plate}</span> {v.description}
                  </p>
                  <p className="text-[var(--muted)]">
                    de{" "}
                    <Link href={`/app/clientes/${v.customerId}`} className="text-[var(--accent)]">
                      {v.customerName}
                    </Link>{" "}
                    · borrado el {formatDate(todayIn("Europe/Madrid", v.deletedAt))} · se eliminará el {purgeDate(v.deletedAt)}
                  </p>
                </div>
                {caps.vehiclesDelete ? <RestoreButton id={v.id} kind="vehicle" /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
