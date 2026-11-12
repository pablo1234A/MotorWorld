import type { Metadata } from "next";
import Link from "next/link";
import { AdminTable, pageParams } from "@/components/admin/table";
import { SearchInput } from "@/components/app/url-filters";
import { Pagination } from "@/components/ui/pagination";
import { Badge, Notice, PageHeader } from "@/components/ui/primitives";
import { platformName } from "@/domain/marketplaces/profiles";
import { LISTING_STATUS_LABELS, conditionLabel, type ConditionCode, type ListingStatus } from "@/domain/product";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import { adminListListings, adminListProducts } from "@/server/services/admin";

export const metadata: Metadata = { title: "Productos y anuncios" };

export default async function AdminCatalogPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; tipo?: string }> }) {
  const params = await searchParams;
  const { page, pageSize, q } = pageParams(params);
  const listings = params.tipo === "anuncios";
  const tab = (href: string, label: string, active: boolean) => (
    <Link href={href} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", active ? "bg-ink text-white" : "text-muted hover:bg-sunken")}>
      {label}
    </Link>
  );
  return (
    <>
      <PageHeader title="Productos y anuncios" description="Consulta de solo lectura para soporte y moderación." />
      <Notice tone="info" className="mb-4">
        Vista limitada: no se muestran costes de adquisición ni fotografías privadas, y no es posible modificar el contenido de los usuarios desde este panel.
      </Notice>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {tab("/admin/catalogo", "Productos", !listings)}
          {tab("/admin/catalogo?tipo=anuncios", "Anuncios", listings)}
        </div>
        <SearchInput placeholder={listings ? "Buscar por título" : "Buscar por nombre"} className="min-w-56 max-w-md flex-1" />
      </div>
      {listings ? <Listings q={q} page={page} pageSize={pageSize} /> : <Products q={q} page={page} pageSize={pageSize} />}
    </>
  );
}

async function Products({ q, page, pageSize }: { q?: string; page: number; pageSize: number }) {
  const result = await adminListProducts(q, page, pageSize);
  return (
    <>
      <AdminTable
        rows={result.items}
        rowKey={(product) => product.id}
        empty="No hay productos."
        columns={[
          { header: "Producto", cell: (product) => <span className="font-medium">{product.name}</span> },
          { header: "Espacio", cell: (product) => <span className="text-muted">{product.workspaces?.name ?? "—"}</span> },
          { header: "Marca", cell: (product) => <span className="text-muted">{product.brand ?? "—"}</span> },
          { header: "Estado", cell: (product) => <span className="text-muted">{conditionLabel(product.condition as ConditionCode, null)}</span> },
          { header: "Precio", className: "text-right tabular-nums", cell: (product) => formatPrice(product.price, product.currency) },
          { header: "Creado", cell: (product) => <span className="whitespace-nowrap text-muted">{formatDate(product.created_at)}</span> },
          { header: "", cell: (product) => (product.archived_at ? <Badge>Archivado</Badge> : null) },
        ]}
      />
      <Pagination page={page} pageCount={Math.ceil(result.total / pageSize)} total={result.total} pageSize={pageSize} basePath="/admin/catalogo" params={{ q }} noun="productos" />
    </>
  );
}

async function Listings({ q, page, pageSize }: { q?: string; page: number; pageSize: number }) {
  const result = await adminListListings(q, page, pageSize);
  return (
    <>
      <AdminTable
        rows={result.items}
        rowKey={(listing) => listing.id}
        empty="No hay anuncios."
        columns={[
          { header: "Título", cell: (listing) => <span className="font-medium">{listing.title}</span> },
          { header: "Espacio", cell: (listing) => <span className="text-muted">{listing.workspaces?.name ?? "—"}</span> },
          { header: "Plataforma", cell: (listing) => <Badge>{platformName(listing.platform)}</Badge> },
          { header: "Estado", cell: (listing) => <span className="text-muted">{LISTING_STATUS_LABELS[listing.status as ListingStatus] ?? listing.status}</span> },
          { header: "Método", cell: (listing) => <span className="text-muted">{{ template: "Plantillas", ai: "IA", manual: "Manual" }[listing.generation_method] ?? listing.generation_method}</span> },
          { header: "Creado", cell: (listing) => <span className="whitespace-nowrap text-muted">{formatDate(listing.created_at)}</span> },
        ]}
      />
      <Pagination page={page} pageCount={Math.ceil(result.total / pageSize)} total={result.total} pageSize={pageSize} basePath="/admin/catalogo" params={{ q, tipo: "anuncios" }} noun="anuncios" />
    </>
  );
}
