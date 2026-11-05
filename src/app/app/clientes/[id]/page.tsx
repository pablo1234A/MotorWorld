import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { Alert, Card } from "@/components/ui/feedback";
import { NextServiceBadge, VehicleStatusBadge } from "@/components/workshop/badges";
import { DeleteCustomerForm, EditCustomerForm } from "@/components/workshop/customer-forms";
import { CreateVehicleForm } from "@/components/workshop/vehicle-forms";
import { formatDate, formatKm, todayIn } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { CUSTOMER_SOURCE_LABELS } from "@/lib/validation/workshop";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { getCustomer } from "@/server/modules/customers/service";

export const metadata: Metadata = { title: "Cliente · RevisaYa" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomerPage({ params, searchParams }: Props) {
  const ctx = await requireOrgPage("/app/clientes");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const customer = await getCustomer(ctx, id);
  if (!customer) notFound();

  const caps = capabilities(ctx);
  const today = todayIn();
  const name = `${customer.firstName} ${customer.lastName}`.trim();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/clientes" className="text-sm text-[var(--accent)]">
          ← Clientes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="text-sm text-[var(--muted)]">
          {CUSTOMER_SOURCE_LABELS[customer.source as keyof typeof CUSTOMER_SOURCE_LABELS] ?? customer.source} · alta el{" "}
          {formatDate(customer.createdAt.toISOString().slice(0, 10))} · {customer.branchName}
        </p>
      </div>
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {param(sp.creado) ? <Alert tone="success">Cliente creado. Ahora puedes añadir sus vehículos.</Alert> : null}
      {param(sp.vehiculo_borrado) ? <Alert tone="success">Vehículo borrado.</Alert> : null}
      {!customer.email ? <Alert tone="info">Este cliente no tiene correo: no recibirá avisos de revisión hasta que lo añadas.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Datos del cliente</h2>
          <EditCustomerForm customer={customer} disabled={!caps.customersWrite} />
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Vehículos ({customer.vehicles.length})</h2>
            {customer.vehicles.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Todavía no tiene vehículos.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {customer.vehicles.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <Link href={`/app/vehiculos/${v.id}`} className="font-mono font-semibold text-[var(--accent)]">
                        {v.plate}
                      </Link>{" "}
                      <span className="text-sm">{[v.make, v.model].filter(Boolean).join(" ")}</span>
                      <div className="text-sm text-[var(--muted)]">
                        {v.currentKm != null ? formatKm(v.currentKm) : "Sin km"} · última revisión {v.lastServiceDate ? formatDate(v.lastServiceDate) : "sin registrar"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <VehicleStatusBadge status={v.status} />
                      {v.status === "active" ? <NextServiceBadge date={v.nextServiceDate} today={today} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {caps.vehiclesWrite ? (
            <div id="nuevo-vehiculo" className="scroll-mt-6">
              <Card>
                <h2 className="mb-4 text-lg font-semibold">Añadir vehículo</h2>
                <CreateVehicleForm customerId={customer.id} canRecordService={caps.maintenanceWrite} />
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Historial de revisiones</h2>
        {customer.history.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No hay revisiones registradas.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {customer.history.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-x-4 gap-y-1 py-3 text-sm">
                <span className="w-24 tabular-nums">{formatDate(h.serviceDate)}</span>
                <Link href={`/app/vehiculos/${h.vehicleId}`} className="w-24 font-mono font-semibold text-[var(--accent)]">
                  {h.plate}
                </Link>
                <span className="w-24 text-[var(--muted)]">{formatKm(h.km)}</span>
                <span className="flex-1">{h.workPerformed}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {caps.customersDelete ? (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Borrar cliente</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Deja de aparecer en las listas y no recibe avisos. El historial de sus vehículos se conserva. Se eliminará definitivamente a los 30 días.
          </p>
          <DeleteCustomerForm id={customer.id} name={name} vehicleCount={customer.vehicles.length} canDeleteVehicles={caps.vehiclesDelete} />
        </Card>
      ) : null}
    </div>
  );
}
