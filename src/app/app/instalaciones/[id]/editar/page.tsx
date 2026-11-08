import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { DeleteInstallationButton, InstallationForm } from "@/components/pci/forms";
import { PageHeader, UUID_RE } from "@/components/pci/page-parts";
import { Card } from "@/components/ui/feedback";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { getInstallation } from "@/server/modules/installations/service";

export const metadata: Metadata = { title: "Editar instalación · RevisaYa" };

export default async function EditInstallationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgPage("/app/instalaciones");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const i = await getInstallation(ctx, id);
  if (!i) notFound();
  const caps = capabilities(ctx);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={`Editar ${i.name}`} subtitle={i.customerName} back={{ href: `/app/instalaciones/${i.id}`, label: "Volver a la instalación" }} />
      {!caps.installationsWrite ? (
        caps.readOnly ? <ReadOnlyNotice /> : <p className="text-sm text-[var(--muted)]">No tienes permiso para editar instalaciones.</p>
      ) : (
        <Card>
          <InstallationForm values={{ ...i }} />
        </Card>
      )}
      {caps.installationsDelete ? (
        <Card>
          <h2 className="font-semibold">Borrar la instalación</h2>
          <p className="mb-3 mt-1 text-sm text-[var(--muted)]">
            Va a la papelera y se puede restaurar durante 30 días. Solo se puede borrar cuando no le quedan equipos: bórralos antes (también van a la papelera).
          </p>
          <DeleteInstallationButton id={i.id} name={i.name} />
        </Card>
      ) : null}
    </div>
  );
}
