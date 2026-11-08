import type { Metadata } from "next";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { Badge } from "@/components/pci/badges";
import { ActionSettingForm, Section } from "@/components/pci/forms";
import { PageHeader } from "@/components/pci/page-parts";
import { Alert } from "@/components/ui/feedback";
import { CATEGORY_CODES, CATEGORY_LABELS } from "@/lib/pci/labels";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { catalog } from "@/server/modules/equipment/service";

export const metadata: Metadata = { title: "Operaciones de mantenimiento · RevisaYa" };

const PERFORMED_BY: Record<string, string> = { owner: "Titular o mantenedor", maintainer: "Empresa mantenedora", any: "Cualquiera" };

export default async function MaintenanceSettingsPage() {
  const ctx = await requireOrgPage("/app/configuracion/mantenimiento");
  if (!isAdmin(ctx)) return <Alert tone="error" title="Sin permiso">Solo los administradores de la empresa pueden configurar las operaciones.</Alert>;
  const { actions } = await catalog(ctx);
  const readOnly = !ctx.subscription.active;
  const periodic = actions.filter((a) => a.defaultIntervalMonths !== null);
  const groups = CATEGORY_CODES.map((c) => ({ code: c, items: periodic.filter((a) => a.categoryCode === c) })).filter((g) => g.items.length);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        back={{ href: "/app/configuracion", label: "Configuración" }}
        title="Operaciones de mantenimiento"
        subtitle="Qué operaciones periódicas se programan en los equipos y cada cuánto. Al cambiarlas se recalculan los vencimientos de todos los equipos afectados."
      />
      {readOnly ? <ReadOnlyNotice /> : null}
      <Alert tone="info" title="Referencia normativa">
        Las operaciones y periodicidades de referencia proceden del Reglamento de instalaciones de protección contra incendios (RD 513/2017, anexo II): la tabla I
        (trimestrales y semestrales, que puede hacer el titular) está desactivada por defecto y la tabla II (anuales y quinquenales, empresa mantenedora) activada.
        Puedes acortar una periodicidad, pero no alargarla. RevisaYa ayuda a planificar; no certifica el cumplimiento normativo: revisa siempre la normativa
        aplicable, las normas UNE y las instrucciones del fabricante.
      </Alert>
      {groups.map((g) => (
        <Section key={g.code} title={CATEGORY_LABELS[g.code]}>
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {g.items.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {a.name} {a.enabled ? <Badge tone="ok">Activa</Badge> : <Badge tone="neutral">Inactiva</Badge>}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Referencia: cada {a.defaultIntervalMonths} meses · {PERFORMED_BY[a.performedBy] ?? a.performedBy}
                    {a.legalReference ? ` · ${a.legalReference}` : ""}
                  </p>
                </div>
                {readOnly ? null : <ActionSettingForm action={a} />}
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}
