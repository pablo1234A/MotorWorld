import { ArrowLeft, Megaphone, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditProductForm } from "@/components/app/product-pages";
import { productToFormValues } from "@/components/app/product-mappers";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardHeader, Notice } from "@/components/ui/primitives";
import { LISTING_STATUS_LABELS, type ListingStatus } from "@/domain/product";
import { platformName } from "@/domain/marketplaces/profiles";
import { formatDate, formatDateTime, isUuid } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";
import { ApiError } from "@/server/http/errors";
import { getCategoryCatalog } from "@/server/services/catalog";
import { getProduct } from "@/server/services/products";
import { getUsage } from "@/server/services/usage";

export const metadata: Metadata = { title: "Producto" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const context = await requireSession();
  const product = await getProduct(context, id).catch((error) => {
    if (error instanceof ApiError && error.code === "not_found") notFound();
    throw error;
  });
  const [catalog, usage, listings] = await Promise.all([
    getCategoryCatalog(),
    getUsage(context.supabase, context.workspace.id),
    context.supabase.from("listings").select("id, title, platform, status, updated_at").eq("product_id", id).eq("workspace_id", context.workspace.id).order("updated_at", { ascending: false }).limit(20),
  ]);
  const { images, ...row } = product;

  return (
    <>
      <Link href="/app/productos" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden /> Mis productos
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-semibold leading-tight">{product.name}</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            ID <span className="font-mono">{product.id.slice(0, 8)}</span> · Creado el {formatDate(product.created_at)} · Modificado el {formatDateTime(product.updated_at)}
          </p>
        </div>
        <ButtonLink href={`/app/crear?producto=${product.id}`} variant="brand">
          <Sparkles aria-hidden /> Generar anuncio
        </ButtonLink>
      </div>

      {product.archived_at ? (
        <Notice tone="warning" className="mb-5">
          Este producto está archivado desde el {formatDate(product.archived_at)}. Puedes restaurarlo desde el listado de productos.
        </Notice>
      ) : null}

      <Card className="mb-5">
        <CardHeader title="Anuncios de este producto" description="Cada anuncio conserva su propio historial de versiones." />
        {listings.data && listings.data.length > 0 ? (
          <ul className="divide-y divide-line">
            {listings.data.map((listing) => (
              <li key={listing.id}>
                <Link href={`/app/anuncios/${listing.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-paper">
                  <Megaphone className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{listing.title}</span>
                  <Badge>{platformName(listing.platform)}</Badge>
                  <Badge tone={listing.status === "ready" ? "success" : "neutral"}>{LISTING_STATUS_LABELS[listing.status as ListingStatus]}</Badge>
                  <span className="hidden text-xs text-muted sm:block">{formatDate(listing.updated_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-muted">Este producto todavía no tiene anuncios.</p>
        )}
      </Card>

      <EditProductForm
        catalog={catalog}
        maxImages={usage.features.maxImagesPerProduct}
        productId={product.id}
        defaults={productToFormValues(row)}
        images={images.map((image) => ({ id: image.id, url: image.url, filename: image.filename, size: image.size }))}
      />
    </>
  );
}
