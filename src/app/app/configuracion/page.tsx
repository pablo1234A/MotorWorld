import type { Metadata } from "next";
import { CustomCategories, WorkspaceForm } from "@/components/app/account-forms";
import { ExportMenu } from "@/components/app/listings-view";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { generationProviderInfo } from "@/domain/generation/registry";
import { requireSession } from "@/server/auth/session";
import { getCategoryCatalog } from "@/server/services/catalog";
import { getUsage } from "@/server/services/usage";

export const metadata: Metadata = { title: "Configuración" };

const ROLE_LABEL: Record<string, string> = { owner: "Propietario", admin: "Administrador", editor: "Editor", viewer: "Solo lectura" };

export default async function SettingsPage() {
  const context = await requireSession();
  const [catalog, usage] = await Promise.all([getCategoryCatalog(), getUsage(context.supabase, context.workspace.id)]);
  const provider = generationProviderInfo();
  const custom = catalog.categories.filter((category) => category.isCustom);
  const byId = new Map(catalog.categories.map((category) => [category.id, category]));

  return (
    <>
      <PageHeader title="Configuración" description="Ajustes de tu espacio de trabajo." />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Espacio de trabajo" description="Todos tus productos y anuncios pertenecen a este espacio." action={<Badge>{ROLE_LABEL[context.role] ?? context.role}</Badge>} />
          <div className="p-5">
            <WorkspaceForm name={context.workspace.name} canEdit={context.role === "owner" || context.role === "admin"} />
            {usage.features.teamReady ? <p className="mt-3 text-[13px] text-muted">La gestión de equipos (invitar miembros) está prevista para una próxima versión; tu plan ya la incluirá cuando se publique.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Categorías personalizadas" description="Añade categorías propias si las del sistema no encajan con lo que vendes. Usa las características del producto para sus datos específicos." />
          <div className="p-5">
            <CustomCategories
              categories={custom.map((category) => ({ id: category.id, name: category.name, parentName: category.parentId ? (byId.get(category.parentId)?.name ?? null) : null }))}
              parents={catalog.categories.filter((category) => !category.parentId).map((category) => ({ id: category.id, name: category.name }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Motor de generación" action={<Badge tone={provider.method === "ai" ? "info" : "neutral"}>{provider.method === "ai" ? "IA externa" : "Sin IA"}</Badge>} />
          <div className="space-y-2 p-5 text-sm leading-relaxed text-ink-soft">
            <p>
              Motor activo: <strong>{provider.label}</strong>.
            </p>
            {provider.method === "template" ? (
              <p className="text-muted">Los anuncios se componen con plantillas y reglas de redacción a partir de los datos de tus productos. No interviene ningún modelo de inteligencia artificial ni se envían tus datos a terceros para generarlos.</p>
            ) : (
              <p className="text-muted">Los datos del producto se envían al proveedor de IA configurado por el administrador de la plataforma para redactar el anuncio. El modelo tiene instrucciones de no añadir información que no hayas proporcionado; revisa siempre el resultado.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Tus datos" description="Descarga una copia de tus anuncios o prepara tu inventario para importarlo." />
          <div className="flex flex-wrap gap-2 p-5">
            <ExportMenu allowedFormats={usage.features.exportFormats} label="Exportar todos mis anuncios" />
            <a href="/api/imports/template" className={buttonClass({ variant: "secondary" })} download>
              Descargar plantilla CSV
            </a>
          </div>
        </Card>
      </div>
    </>
  );
}
