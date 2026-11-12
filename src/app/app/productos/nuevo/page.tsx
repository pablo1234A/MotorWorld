import type { Metadata } from "next";
import Link from "next/link";
import { NewProductForm } from "@/components/app/product-pages";
import { PageHeader } from "@/components/ui/primitives";
import { requireSession } from "@/server/auth/session";
import { getCategoryCatalog } from "@/server/services/catalog";
import { getUsage } from "@/server/services/usage";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function NewProductPage() {
  const context = await requireSession();
  const [catalog, usage] = await Promise.all([getCategoryCatalog(), getUsage(context.supabase, context.workspace.id)]);
  return (
    <>
      <PageHeader
        title="Nuevo producto"
        description={
          <>
            Guarda el producto en tu catálogo. Si quieres generar su anuncio directamente, usa{" "}
            <Link href="/app/crear" className="font-medium text-brand-strong hover:underline">
              Crear anuncio
            </Link>
            .
          </>
        }
      />
      <NewProductForm catalog={catalog} maxImages={usage.features.maxImagesPerProduct} />
    </>
  );
}
