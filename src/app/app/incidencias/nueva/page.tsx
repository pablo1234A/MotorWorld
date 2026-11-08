import type { Metadata } from "next";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { IncidentForm } from "@/components/pci/forms";
import { INPUT, PageHeader, uuidOrUndefined } from "@/components/pci/page-parts";
import { buttonClass } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/feedback";
import { todayIn } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listEquipment } from "@/server/modules/equipment/service";
import { installationOptions } from "@/server/modules/installations/service";

export const metadata: Metadata = { title: "Nueva incidencia · RevisaYa" };

export default async function NewIncidentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgPage("/app/incidencias/nueva");
  const sp = await searchParams;
  const caps = capabilities(ctx);
  const installationId = uuidOrUndefined(param(sp.instalacion, 40));
  const equipmentId = uuidOrUndefined(param(sp.equipo, 40));
  const workOrderId = uuidOrUndefined(param(sp.orden, 40));
  const installations = await installationOptions(ctx);
  const equipment = installationId ? (await listEquipment(ctx, { installationId, page: 1, pageSize: 500 })).rows.map((e) => ({ id: e.id, code: `${e.code}${e.location ? ` · ${e.location}` : ""}` })) : undefined;
  const back = workOrderId
    ? { href: `/app/ordenes-trabajo/${workOrderId}`, label: "Volver a la orden" }
    : equipmentId
      ? { href: `/app/equipos/${equipmentId}`, label: "Volver al equipo" }
      : installationId
        ? { href: `/app/instalaciones/${installationId}`, label: "Volver a la instalación" }
        : { href: "/app/incidencias", label: "Incidencias" };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Nueva incidencia" back={back} />
      {!caps.incidentsWrite ? (
        caps.readOnly ? <ReadOnlyNotice /> : <p className="text-sm text-[var(--muted)]">No tienes permiso para registrar incidencias.</p>
      ) : !installationId ? (
        <Card>
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              Instalación
              <select name="instalacion" required className={INPUT}>
                <option value="">Elige la instalación…</option>
                {installations.map((o) => (
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
        </Card>
      ) : (
        <Card>
          <IncidentForm installations={installations} equipment={equipment} defaults={{ installationId, equipmentId, workOrderId }} today={todayIn()} />
        </Card>
      )}
    </div>
  );
}
