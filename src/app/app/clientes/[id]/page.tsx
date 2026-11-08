import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { DueBadge } from "@/components/pci/badges";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import {
  NextServiceBadge,
  VehicleStatusBadge,
} from "@/components/workshop/badges";
import {
  DeleteCustomerForm,
  EditCustomerForm,
} from "@/components/workshop/customer-forms";
import { EraseCustomerForm } from "@/components/workshop/privacy-forms";
import { CreateVehicleForm } from "@/components/workshop/vehicle-forms";
import { formatDate, formatKm, todayIn } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { ESTABLISHMENT_LABELS } from "@/lib/pci/labels";
import { CUSTOMER_SOURCE_LABELS } from "@/lib/validation/workshop";
import { capabilities } from "@/server/auth/capabilities";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { getCustomer } from "@/server/modules/customers/service";
import { listInstallations } from "@/server/modules/installations/service";
import { legacyVehicleCounts } from "@/server/modules/vehicles/service";

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
  const [installations, legacyCounts] = await Promise.all([
    listInstallations(ctx, { customerId: customer.id, page: 1, pageSize: 200 }),
    legacyVehicleCounts(ctx),
  ]);
  // Vehículos: solo si la cuenta los conserva de la etapa anterior (no se convierten en equipos).
  const legacy = customer.vehicles.length > 0 || customer.history.length > 0 || legacyCounts.vehicles > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/clientes" className="text-sm text-[var(--accent)]">
          ← Clientes
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          {caps.installationsWrite ? (
            <Link
              href={`/app/instalaciones/nueva?cliente=${customer.id}`}
              className={buttonClass("primary")}
            >
              Nueva instalación
            </Link>
          ) : null}
        </div>
        {customer.legalName ? (
          <p className="text-sm">
            {customer.legalName}
            {customer.taxId ? ` · ${customer.taxId}` : ""}
          </p>
        ) : null}
        <p className="text-sm text-[var(--muted)]">
          {CUSTOMER_SOURCE_LABELS[
            customer.source as keyof typeof CUSTOMER_SOURCE_LABELS
          ] ?? customer.source}{" "}
          · alta el {formatDate(customer.createdAt.toISOString().slice(0, 10))}{" "}
          · {customer.branchName}
        </p>
      </div>
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {param(sp.creado) ? (
        <Alert tone="success">
          Cliente creado. Ahora añade sus instalaciones.
        </Alert>
      ) : null}
      {param(sp.instalacion_borrada) ? (
        <Alert tone="success">Instalación enviada a la papelera.</Alert>
      ) : null}
      {param(sp.vehiculo_borrado) ? (
        <Alert tone="success">Vehículo borrado.</Alert>
      ) : null}
      {!customer.email ? (
        <Alert tone="info">
          Este cliente no tiene correo: no recibirá avisos de mantenimiento
          hasta que lo añadas.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Datos del cliente</h2>
          <EditCustomerForm
            customer={customer}
            disabled={!caps.customersWrite}
          />
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-4 text-lg font-semibold">
              Instalaciones ({installations.total})
            </h2>
            {installations.rows.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Todavía no tiene instalaciones.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {installations.rows.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/app/instalaciones/${i.id}`}
                        className="font-semibold text-[var(--accent)]"
                      >
                        {i.name}
                      </Link>
                      <div className="text-sm text-[var(--muted)]">
                        {ESTABLISHMENT_LABELS[
                          i.establishmentType as keyof typeof ESTABLISHMENT_LABELS
                        ] ?? i.establishmentType}{" "}
                        · {i.addressLine1}
                        {i.city ? `, ${i.city}` : ""} · {i.equipment} equipos
                      </div>
                    </div>
                    <DueBadge date={i.nextActionOn} today={today} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {legacy ? (
            <>
              <Card>
                <h2 className="mb-4 text-lg font-semibold">
                  Vehículos de la etapa anterior ({customer.vehicles.length})
                </h2>
                {customer.vehicles.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Todavía no tiene vehículos.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {customer.vehicles.map((v) => (
                      <li
                        key={v.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3"
                      >
                        <div>
                          <Link
                            href={`/app/vehiculos/${v.id}`}
                            className="font-mono font-semibold text-[var(--accent)]"
                          >
                            {v.plate}
                          </Link>{" "}
                          <span className="text-sm">
                            {[v.make, v.model].filter(Boolean).join(" ")}
                          </span>
                          <div className="text-sm text-[var(--muted)]">
                            {v.currentKm != null
                              ? formatKm(v.currentKm)
                              : "Sin km"}{" "}
                            · última revisión{" "}
                            {v.lastServiceDate
                              ? formatDate(v.lastServiceDate)
                              : "sin registrar"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <VehicleStatusBadge status={v.status} />
                          {v.status === "active" ? (
                            <NextServiceBadge
                              date={v.nextServiceDate}
                              today={today}
                            />
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {caps.vehiclesWrite ? (
                <div id="nuevo-vehiculo" className="scroll-mt-6">
                  <Card>
                    <h2 className="mb-4 text-lg font-semibold">
                      Añadir vehículo
                    </h2>
                    <CreateVehicleForm
                      customerId={customer.id}
                      canRecordService={caps.maintenanceWrite}
                    />
                  </Card>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {legacy ? (
        <Card>
          <h2 className="mb-4 text-lg font-semibold">
            Historial de revisiones de vehículos
          </h2>
          {customer.history.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No hay revisiones registradas.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {customer.history.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap gap-x-4 gap-y-1 py-3 text-sm"
                >
                  <span className="w-24 tabular-nums">
                    {formatDate(h.serviceDate)}
                  </span>
                  <Link
                    href={`/app/vehiculos/${h.vehicleId}`}
                    className="w-24 font-mono font-semibold text-[var(--accent)]"
                  >
                    {h.plate}
                  </Link>
                  <span className="w-24 text-[var(--muted)]">
                    {formatKm(h.km)}
                  </span>
                  <span className="flex-1">{h.workPerformed}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {caps.customersDelete ? (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Borrar cliente</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Deja de aparecer en las listas y no recibe avisos. Se puede
            restaurar desde la papelera durante 30 días; después se elimina
            definitivamente con su historial.
          </p>
          <DeleteCustomerForm
            id={customer.id}
            name={name}
            vehicleCount={customer.vehicles.length}
            canDeleteVehicles={caps.vehiclesDelete}
          />
        </Card>
      ) : null}

      {isAdmin(ctx) ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Protección de datos</h2>
          <p className="text-sm text-[var(--muted)]">
            Si el cliente te pide sus datos, descárgalos y envíaselos. Si te
            pide que los borres, el borrado definitivo elimina al momento la
            ficha, sus instalaciones, equipos e historial, sus visitas, sus
            avisos y sus presupuestos (no pasa por la papelera y no se puede
            deshacer). Su correo se mantiene en la lista de bajas para no volver
            a escribirle.
          </p>
          <a
            href={`/api/app/customers/${customer.id}/export`}
            className="self-start text-sm font-medium text-[var(--accent)] underline"
            download
          >
            Descargar sus datos (JSON)
          </a>
          <EraseCustomerForm id={customer.id} name={name} />
        </Card>
      ) : null}
    </div>
  );
}
