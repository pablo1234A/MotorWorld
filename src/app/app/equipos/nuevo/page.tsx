import type { Metadata } from "next";
import Link from "next/link";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { EquipmentForm } from "@/components/pci/forms";
import { PageHeader, uuidOrUndefined } from "@/components/pci/page-parts";
import { Alert, Card } from "@/components/ui/feedback";
import { param } from "@/lib/pagination";
import { CATEGORY_CODES, type CategoryCode } from "@/lib/pci/labels";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { catalog, getEquipment } from "@/server/modules/equipment/service";
import { installationOptions } from "@/server/modules/installations/service";

export const metadata: Metadata = { title: "Nuevo equipo · RevisaYa" };

export default async function NewEquipmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgPage("/app/equipos/nuevo");
  const sp = await searchParams;
  const caps = capabilities(ctx);
  const installationId = uuidOrUndefined(param(sp.instalacion, 40));
  const cat = param(sp.categoria, 40);
  const categoryCode = (CATEGORY_CODES as readonly string[]).includes(cat ?? "") ? (cat as CategoryCode) : undefined;
  const createdId = uuidOrUndefined(param(sp.creado, 40));
  const [installations, cat2, created] = await Promise.all([installationOptions(ctx), catalog(ctx), createdId ? getEquipment(ctx, createdId) : Promise.resolve(null)]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Nuevo equipo"
        back={installationId ? { href: `/app/instalaciones/${installationId}`, label: "Volver a la instalación" } : { href: "/app/equipos", label: "Equipos PCI" }}
      />
      {created ? (
        <Alert tone="success">
          Equipo{" "}
          <Link href={`/app/equipos/${created.id}`} className="font-mono font-medium text-[var(--accent)]">
            {created.code}
          </Link>{" "}
          creado. Puedes dar de alta el siguiente.
        </Alert>
      ) : null}
      {!caps.equipmentWrite ? (
        caps.readOnly ? <ReadOnlyNotice /> : <p className="text-sm text-[var(--muted)]">No tienes permiso para dar de alta equipos.</p>
      ) : installations.length === 0 ? (
        <Card>
          <p className="text-sm">
            Primero crea una instalación activa.{" "}
            <Link href="/app/instalaciones/nueva" className="font-medium text-[var(--accent)]">
              Nueva instalación
            </Link>
          </p>
        </Card>
      ) : (
        <Card>
          <EquipmentForm
            key={createdId ?? "new"}
            values={{ installationId, categoryCode }}
            installations={installations}
            types={cat2.types.map((t) => ({ id: t.id, categoryCode: t.categoryCode, name: t.name }))}
          />
        </Card>
      )}
    </div>
  );
}
