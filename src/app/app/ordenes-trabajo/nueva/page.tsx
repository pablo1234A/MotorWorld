import type { Metadata } from "next";
import Link from "next/link";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { WorkOrderCreateForm } from "@/components/pci/forms";
import { INPUT, PageHeader, uuidOrUndefined } from "@/components/pci/page-parts";
import { buttonClass } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/feedback";
import { addDays, formatDate, todayIn } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { catalog, listEquipment } from "@/server/modules/equipment/service";
import { getInstallation, installationOptions } from "@/server/modules/installations/service";
import { listTechnicians } from "@/server/modules/technicians/service";
import { dueItemsForInstallation } from "@/server/modules/work-orders/service";

export const metadata: Metadata = { title: "Nueva orden de trabajo · RevisaYa" };

const HORIZONS = [30, 60, 90, 180] as const;

export default async function NewWorkOrderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgPage("/app/ordenes-trabajo/nueva");
  const sp = await searchParams;
  const caps = capabilities(ctx);
  const installationId = uuidOrUndefined(param(sp.instalacion, 40));
  const horizon = HORIZONS.find((h) => String(h) === param(sp.plazo)) ?? 30;
  const today = todayIn();

  if (!caps.workOrdersManage) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <PageHeader title="Nueva orden de trabajo" back={{ href: "/app/ordenes-trabajo", label: "Órdenes de trabajo" }} />
        {caps.readOnly ? <ReadOnlyNotice /> : <p className="text-sm text-[var(--muted)]">No tienes permiso para crear órdenes de trabajo.</p>}
      </div>
    );
  }

  const inst = installationId ? await getInstallation(ctx, installationId) : null;
  if (!inst) {
    const options = await installationOptions(ctx);
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <PageHeader title="Nueva orden de trabajo" subtitle="Una orden agrupa los equipos de una instalación que se revisan en la misma visita." back={{ href: "/app/ordenes-trabajo", label: "Órdenes de trabajo" }} />
        <Card>
          {options.length === 0 ? (
            <p className="text-sm">
              No hay instalaciones activas.{" "}
              <Link href="/app/instalaciones/nueva" className="font-medium text-[var(--accent)]">
                Crear instalación
              </Link>
            </p>
          ) : (
            <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
                Instalación
                <select name="instalacion" required className={INPUT}>
                  <option value="">Elige la instalación…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={buttonClass("primary")}>
                Continuar
              </button>
            </form>
          )}
        </Card>
      </div>
    );
  }

  const [due, equipment, cat, technicians] = await Promise.all([
    dueItemsForInstallation(ctx, inst.id, addDays(today, horizon)),
    listEquipment(ctx, { installationId: inst.id, status: "in_service", page: 1, pageSize: 500 }),
    catalog(ctx),
    listTechnicians(ctx, { activeOnly: true }),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Nueva orden de trabajo"
        subtitle={`${inst.name} · ${inst.customerName}`}
        back={{ href: `/app/instalaciones/${inst.id}`, label: "Volver a la instalación" }}
      />
      {inst.status !== "active" ? (
        <p className="text-sm text-[var(--danger)]">La instalación está inactiva: actívala antes de crear órdenes.</p>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="instalacion" value={inst.id} />
            <label htmlFor="plazo">Incluir lo que vence hasta</label>
            <select id="plazo" name="plazo" defaultValue={String(horizon)} className={INPUT}>
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {h} días ({formatDate(addDays(today, h))})
                </option>
              ))}
            </select>
            <button type="submit" className={buttonClass("secondary", "!py-1.5")}>
              Actualizar
            </button>
          </form>
          <Card>
            <WorkOrderCreateForm
              installationId={inst.id}
              technicians={technicians.map((t) => ({ id: t.id, fullName: t.fullName }))}
              dueItems={due}
              allEquipment={equipment.rows.map((e) => ({ id: e.id, code: e.code, categoryCode: e.categoryCode, location: e.location }))}
              actions={cat.actions.map((a) => ({ id: a.id, name: a.name, categoryCode: a.categoryCode }))}
              today={today}
            />
          </Card>
          {technicians.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Aún no hay técnicos dados de alta.{" "}
              <Link href="/app/configuracion/tecnicos" className="text-[var(--accent)]">
                Añadir técnicos
              </Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
