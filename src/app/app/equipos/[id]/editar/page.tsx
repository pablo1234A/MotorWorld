import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { DeleteEquipmentButton, EquipmentForm } from "@/components/pci/forms";
import { PageHeader, UUID_RE } from "@/components/pci/page-parts";
import { Card } from "@/components/ui/feedback";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { catalog, getEquipment } from "@/server/modules/equipment/service";
import { installationOptions } from "@/server/modules/installations/service";

export const metadata: Metadata = { title: "Editar equipo · RevisaYa" };

export default async function EditEquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgPage("/app/equipos");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const e = await getEquipment(ctx, id);
  if (!e) notFound();
  const caps = capabilities(ctx);
  const [installations, cat] = await Promise.all([installationOptions(ctx), catalog(ctx)]);
  // La instalación actual siempre aparece, aunque esté inactiva.
  const options = installations.some((i) => i.id === e.installationId) ? installations : [{ id: e.installationId, label: `${e.customerName} · ${e.installationName}` }, ...installations];
  const x = e.extinguisher;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={`Editar ${e.code}`} subtitle={e.installationName} back={{ href: `/app/equipos/${e.id}`, label: "Volver al equipo" }} />
      {!caps.equipmentWrite ? (
        caps.readOnly ? <ReadOnlyNotice /> : <p className="text-sm text-[var(--muted)]">No tienes permiso para editar equipos.</p>
      ) : (
        <Card>
          <EquipmentForm
            values={{
              id: e.id, installationId: e.installationId, categoryCode: e.categoryCode, typeId: e.typeId, code: e.code, manufacturer: e.manufacturer, model: e.model,
              serialNumber: e.serialNumber, location: e.location, installedOn: e.installedOn, manufacturedOn: e.manufacturedOn, status: e.status, notes: e.notes,
              agent: x?.agent, chargeValue: x?.chargeValue, chargeUnit: x?.chargeUnit, efficacy: x?.efficacy, mobility: x?.mobility, stampedOn: x?.stampedOn,
              putInServiceOn: x?.putInServiceOn, retimbradosBefore: x?.retimbradosBefore,
            }}
            installations={options}
            types={cat.types.map((t) => ({ id: t.id, categoryCode: t.categoryCode, name: t.name }))}
          />
        </Card>
      )}
      {caps.equipmentDelete ? (
        <Card>
          <h2 className="font-semibold">Borrar el equipo</h2>
          <p className="mb-3 mt-1 text-sm text-[var(--muted)]">
            Si el equipo se ha retirado de la instalación, mejor registra una actuación de «Baja» o cambia su estado a «Retirado»: así se conserva su historial a la vista.
            Borrarlo lo envía a la papelera (30 días) por si se dio de alta por error.
          </p>
          <DeleteEquipmentButton id={e.id} code={e.code} />
        </Card>
      ) : null}
    </div>
  );
}
