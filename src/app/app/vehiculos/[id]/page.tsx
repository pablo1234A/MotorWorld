import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import { NextServiceBadge, VehicleStatusBadge } from "@/components/workshop/badges";
import { DeleteRecordButton, MaintenanceForm } from "@/components/workshop/maintenance-form";
import { ChangeOwnerForm, DeleteVehicleForm, EditVehicleForm, MileageForm, NextServiceForm } from "@/components/workshop/vehicle-forms";
import { formatDate, formatKm, todayIn } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { formatPhone } from "@/lib/phone";
import { capabilities } from "@/server/auth/capabilities";
import { can } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { getVehicle } from "@/server/modules/vehicles/service";

export const metadata: Metadata = { title: "Vehículo · RevisaYa" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const MILEAGE_SOURCES: Record<string, string> = {
  maintenance: "revisión",
  manual: "lectura manual",
  import: "importación",
  appointment: "cita",
};

export default async function VehiclePage({ params, searchParams }: Props) {
  const ctx = await requireOrgPage("/app/vehiculos");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const v = await getVehicle(ctx, id);
  if (!v) notFound();

  const caps = capabilities(ctx);
  const today = todayIn();
  const title = [v.make, v.model].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/vehiculos" className="text-sm text-[var(--accent)]">
          ← Vehículos
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{v.plate}</h1>
          <VehicleStatusBadge status={v.status} />
          {v.status === "active" && ctx.subscription.active && can(ctx, "appointments.manage") ? (
            <Link href={`/app/citas/nueva?cliente=${v.customer.id}&vehiculo=${v.id}`} className={buttonClass("secondary", "ml-auto")}>
              Nueva cita
            </Link>
          ) : null}
          {ctx.subscription.active && can(ctx, "quotes.manage") ? (
            <Link href={`/app/presupuestos/nuevo?cliente=${v.customer.id}&vehiculo=${v.id}`} className={buttonClass("ghost")}>
              Nuevo presupuesto
            </Link>
          ) : null}
        </div>
        <p className="text-sm text-[var(--muted)]">
          {title || "Marca y modelo sin indicar"} · propietario{" "}
          <Link href={`/app/clientes/${v.customer.id}`} className="font-medium text-[var(--accent)]">
            {v.customer.name}
          </Link>
          {v.customer.email ? ` · ${v.customer.email}` : " · sin correo"}
          {v.customer.phone ? ` · ${formatPhone(v.customer.phone)}` : ""}
        </p>
      </div>
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {param(sp.creado) ? <Alert tone="success">Vehículo dado de alta.</Alert> : null}
      {param(sp.revision_editada) ? <Alert tone="success">Revisión actualizada.</Alert> : null}

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <dt className="text-sm text-[var(--muted)]">Kilómetros</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{v.currentKm != null ? formatKm(v.currentKm) : "—"}</dd>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <dt className="text-sm text-[var(--muted)]">Última revisión</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{v.lastServiceDate ? formatDate(v.lastServiceDate) : "—"}</dd>
          {v.lastServiceKm != null ? <dd className="text-sm text-[var(--muted)]">a los {formatKm(v.lastServiceKm)}</dd> : null}
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <dt className="text-sm text-[var(--muted)]">Próxima revisión</dt>
          <dd className="mt-2">
            <NextServiceBadge date={v.nextServiceDate} today={today} />
          </dd>
          <dd className="mt-1 text-xs text-[var(--muted)]">
            {v.nextServiceKm != null ? `o a los ${formatKm(v.nextServiceKm)} · ` : ""}
            {v.nextServiceSource === "manual" ? "fijada a mano" : "calculada"}
          </dd>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <dt className="text-sm text-[var(--muted)]">Bastidor</dt>
          <dd className="mt-1 break-all font-mono text-sm">{v.vin ?? "—"}</dd>
          <dd className="mt-1 text-xs text-[var(--muted)]">{v.branchName}</dd>
        </div>
      </dl>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          {caps.maintenanceWrite ? (
            <Card>
              <h2 className="mb-4 text-lg font-semibold">Registrar revisión</h2>
              <MaintenanceForm vehicleId={v.id} today={today} />
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-4 text-lg font-semibold">Historial ({v.history.length})</h2>
            {v.history.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No hay revisiones registradas.</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {v.history.map((r) => (
                  <li key={r.id} className="rounded-lg border border-[var(--border)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold tabular-nums">
                          {formatDate(r.serviceDate)}
                          {r.km != null ? <span className="font-normal text-[var(--muted)]"> · {formatKm(r.km)}</span> : null}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {r.ownerName ? `Propietario entonces: ${r.ownerName}` : ""}
                          {r.createdByName ? ` · registrada por ${r.createdByName}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {caps.maintenanceWrite ? (
                          <Link href={`/app/vehiculos/${v.id}/revisiones/${r.id}`} className="rounded-lg px-2 py-1 text-sm font-medium text-[var(--accent)] hover:bg-[var(--surface-2)]">
                            Editar
                          </Link>
                        ) : null}
                        {caps.maintenanceDelete ? <DeleteRecordButton id={r.id} date={formatDate(r.serviceDate)} /> : null}
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm">{r.workPerformed}</p>
                    {r.parts.length ? (
                      <ul className="mt-2 list-disc pl-5 text-sm text-[var(--muted)]">
                        {r.parts.map((p) => (
                          <li key={p.id}>
                            {Number(p.quantity).toLocaleString("es-ES")} × {p.description}
                            {p.reference ? ` (ref. ${p.reference})` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {r.notes ? <p className="mt-2 whitespace-pre-line text-sm text-[var(--muted)]">{r.notes}</p> : null}
                    {r.nextRecommendedDate || r.nextRecommendedKm ? (
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Próxima recomendada: {formatDate(r.nextRecommendedDate)}
                        {r.nextRecommendedKm ? ` · ${formatKm(r.nextRecommendedKm)}` : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {caps.vehiclesWrite ? (
            <>
              <Card>
                <h2 className="mb-4 text-lg font-semibold">Actualizar kilómetros</h2>
                <MileageForm id={v.id} today={today} />
              </Card>
              <Card>
                <h2 className="mb-4 text-lg font-semibold">Próxima revisión</h2>
                <NextServiceForm id={v.id} date={v.nextServiceDate} km={v.nextServiceKm} />
              </Card>
            </>
          ) : null}
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Lecturas de kilometraje</h2>
            {v.mileage.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Sin lecturas.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] text-sm">
                {v.mileage.map((m, i) => (
                  <li key={i} className="flex justify-between py-2">
                    <span className="tabular-nums">{formatDate(m.readOn)}</span>
                    <span className="tabular-nums">{formatKm(m.km)}</span>
                    <span className="text-[var(--muted)]">{MILEAGE_SOURCES[m.source] ?? m.source}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {caps.vehiclesWrite ? (
            <>
              <Card>
                <h2 className="mb-4 text-lg font-semibold">Datos del vehículo</h2>
                <EditVehicleForm vehicle={v} />
              </Card>
              <Card>
                <h2 className="mb-1 text-lg font-semibold">Cambiar propietario</h2>
                <p className="mb-4 text-sm text-[var(--muted)]">El historial se queda con el vehículo.</p>
                <ChangeOwnerForm id={v.id} branchId={v.branchId} currentCustomerId={v.customer.id} />
              </Card>
            </>
          ) : null}
          {caps.vehiclesDelete ? (
            <Card>
              <h2 className="mb-1 text-lg font-semibold">Borrar vehículo</h2>
              <p className="mb-4 text-sm text-[var(--muted)]">Si lo ha vendido o dado de baja, mejor cambia su estado y conservarás la ficha. Lo borrado se puede restaurar durante 30 días desde la papelera.</p>
              <DeleteVehicleForm id={v.id} plate={v.plate} />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
