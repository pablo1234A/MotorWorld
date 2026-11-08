import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { PrintButton } from "@/components/pci/print-button";
import { PageHeader, UUID_RE } from "@/components/pci/page-parts";
import { CATEGORY_SINGULAR } from "@/lib/pci/labels";
import { requireOrgPage } from "@/server/auth/guards";
import { getServerEnv } from "@/server/env";
import { equipmentLabels } from "@/server/modules/equipment/service";
import { getInstallation } from "@/server/modules/installations/service";

export const metadata: Metadata = { title: "Etiquetas QR · RevisaYa" };

/**
 * Hoja imprimible de etiquetas. El QR solo lleva la dirección de la ficha
 * protegida con un token aleatorio: no contiene datos del cliente y quien lo
 * escanee necesita iniciar sesión en la empresa para ver nada.
 */
export default async function LabelsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgPage("/app/instalaciones");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const inst = await getInstallation(ctx, id);
  if (!inst) notFound();
  const base = getServerEnv().APP_URL.replace(/\/$/, "");
  const labels = await Promise.all(
    (await equipmentLabels(ctx, id)).map(async (e) => ({
      ...e,
      svg: await QRCode.toString(`${base}/app/equipos/qr/${e.qrToken}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHeader
          back={{ href: `/app/instalaciones/${inst.id}`, label: "Volver a la instalación" }}
          title="Etiquetas QR"
          subtitle={`${inst.name} · ${labels.length} equipos. Al escanearlas, el técnico abre la ficha del equipo tras iniciar sesión.`}
          actions={<PrintButton />}
        />
      </div>
      {labels.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No hay equipos en servicio en esta instalación.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-2">
          {labels.map((l) => (
            <li key={l.id} className="flex break-inside-avoid flex-col items-center gap-1 rounded-lg border border-[var(--border)] bg-white p-3 text-center text-black">
              <div className="w-32" aria-hidden dangerouslySetInnerHTML={{ __html: l.svg }} />
              <p className="font-mono text-sm font-bold">{l.code}</p>
              <p className="text-xs">{l.typeName ?? CATEGORY_SINGULAR[l.categoryCode]}</p>
              {l.location ? <p className="text-xs text-neutral-600">{l.location}</p> : null}
              <p className="text-[10px] text-neutral-600">{inst.name}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
