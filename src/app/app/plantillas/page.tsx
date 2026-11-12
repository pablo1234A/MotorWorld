import type { Metadata } from "next";
import { TemplatesManager } from "@/components/app/templates-manager";
import { Badge, Card, Notice, PageHeader } from "@/components/ui/primitives";
import { MARKETPLACE_IDS, MARKETPLACE_PROFILES, PRODUCT_FIELD_LABELS, type TemplateConfiguration } from "@/domain/marketplaces/profiles";
import { requireSession } from "@/server/auth/session";
import { listTemplates } from "@/server/services/templates";
import { getUsage } from "@/server/services/usage";

export const metadata: Metadata = { title: "Plantillas" };

export default async function TemplatesPage() {
  const context = await requireSession();
  const [templates, usage] = await Promise.all([listTemplates(context), getUsage(context.supabase, context.workspace.id)]);

  return (
    <>
      <PageHeader title="Plantillas" description="Los perfiles de marketplace definen cómo se presenta un anuncio en cada plataforma. Crea plantillas propias para ajustarlos a tu forma de vender." />

      <TemplatesManager
        templates={templates.map((template) => ({ id: template.id, name: template.name, platform: template.platform, is_active: template.is_active, configuration: (template.configuration ?? {}) as TemplateConfiguration }))}
        maxTemplates={usage.features.maxTemplates}
      />

      <h2 className="mb-3 mt-9 font-sans text-[15px] font-semibold tracking-normal">Perfiles de marketplace incluidos</h2>
      <Notice tone="info" className="mb-4">
        AnunciaPro no tiene integración oficial con estas plataformas ni publica en ellas: prepara el texto para copiarlo o exportarlo. Los límites de caracteres son orientativos; compruébalos en la plataforma y ajústalos con una plantilla propia si cambian.
      </Notice>
      <div className="grid gap-4 md:grid-cols-2">
        {MARKETPLACE_IDS.map((id) => {
          const profile = MARKETPLACE_PROFILES[id];
          return (
            <Card key={id} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{profile.name}</h3>
                <Badge>{profile.descriptionFormat === "html" ? "HTML" : "Texto plano"}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                <dt className="text-muted">Título</dt>
                <dd className="tabular-nums">hasta {profile.titleMaxLength} caracteres</dd>
                <dt className="text-muted">Descripción</dt>
                <dd className="tabular-nums">hasta {profile.descriptionMaxLength.toLocaleString("es-ES")} caracteres</dd>
                <dt className="text-muted">Palabras clave</dt>
                <dd>
                  hasta {profile.maxKeywords}
                  {profile.hashtags ? " (como hashtags)" : ""}
                </dd>
                <dt className="text-muted">Campos habituales</dt>
                <dd>{profile.requiredFields.map((field) => PRODUCT_FIELD_LABELS[field]).join(", ")}</dd>
                <dt className="text-muted">Campos opcionales</dt>
                <dd>{profile.optionalFields.map((field) => PRODUCT_FIELD_LABELS[field]).join(", ")}</dd>
              </dl>
              <ul className="mt-3 list-inside list-disc space-y-1 text-[13px] text-ink-soft">
                {profile.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
