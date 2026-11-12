import type { Metadata } from "next";
import { Generator } from "@/components/app/generator";
import { PageHeader } from "@/components/ui/primitives";
import { generationProviderInfo } from "@/domain/generation/registry";
import { isUuid } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";
import { getCategoryCatalog } from "@/server/services/catalog";
import { listTemplates } from "@/server/services/templates";
import { getUsage } from "@/server/services/usage";

export const metadata: Metadata = { title: "Crear anuncio" };

export default async function CreateListingPage({ searchParams }: { searchParams: Promise<{ producto?: string }> }) {
  const { producto } = await searchParams;
  const context = await requireSession();
  const [catalog, usage, templates, product] = await Promise.all([
    getCategoryCatalog(),
    getUsage(context.supabase, context.workspace.id),
    listTemplates(context),
    isUuid(producto)
      ? context.supabase.from("products").select("id, name").eq("id", producto).eq("workspace_id", context.workspace.id).maybeSingle().then((result) => result.data)
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader title="Crear anuncio" description="Convierte un producto en un anuncio completo: título, descripción, puntos de venta y palabras clave." />
      <Generator
        catalog={catalog}
        templates={templates.filter((template) => template.is_active).map((template) => ({ id: template.id, name: template.name, platform: template.platform }))}
        usage={{ used: usage.used, limit: usage.monthlyListingLimit, remaining: usage.remaining }}
        providerLabel={generationProviderInfo().label}
        maxImages={usage.features.maxImagesPerProduct}
        initialProduct={product}
        initialOptions={{ platform: "generic", templateId: null, tone: "professional", length: "medium", language: "es", titleVariant: 0 }}
      />
    </>
  );
}
