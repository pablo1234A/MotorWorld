import type { Metadata } from "next";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { Badge } from "@/components/pci/badges";
import { Section, TechnicianForm } from "@/components/pci/forms";
import { PageHeader } from "@/components/pci/page-parts";
import { Alert } from "@/components/ui/feedback";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { listTechnicians, memberOptions } from "@/server/modules/technicians/service";

export const metadata: Metadata = { title: "Técnicos · RevisaYa" };

export default async function TechniciansPage() {
  const ctx = await requireOrgPage("/app/configuracion/tecnicos");
  if (!isAdmin(ctx)) return <Alert tone="error" title="Sin permiso">Solo los administradores de la empresa pueden gestionar los técnicos.</Alert>;
  const [technicians, members] = await Promise.all([listTechnicians(ctx), memberOptions(ctx)]);
  const readOnly = !ctx.subscription.active;
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        back={{ href: "/app/configuracion", label: "Configuración" }}
        title="Técnicos"
        subtitle="Las personas que ejecutan las órdenes de trabajo. Si les vinculas un usuario del panel con el rol «Técnico / operario», verán en el móvil solo las órdenes que tengan asignadas."
      />
      {readOnly ? <ReadOnlyNotice /> : null}
      <Alert tone="info">
        RevisaYa no comprueba habilitaciones ni certificados. Lo que anotes en «Notas de cualificación» es información interna de tu empresa.
      </Alert>
      {technicians.map((t) => (
        <Section
          key={t.id}
          title={t.fullName}
          actions={
            <span className="flex min-w-0 flex-wrap gap-2">
              {t.active ? <Badge tone="ok">Activo</Badge> : <Badge tone="neutral">Inactivo</Badge>}
              {t.memberEmail ? <Badge tone="info" className="max-w-full whitespace-normal break-all">
                  Usuario: {t.memberEmail}
                </Badge> : null}
              <Badge tone="neutral">{t.openOrders} órdenes abiertas</Badge>
            </span>
          }
        >
          {readOnly ? null : <TechnicianForm technician={t} members={members} />}
        </Section>
      ))}
      {readOnly ? null : (
        <Section title="Añadir técnico">
          <TechnicianForm members={members} />
        </Section>
      )}
    </div>
  );
}
