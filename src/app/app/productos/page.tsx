import { PackageSearch, Plus } from "lucide-react";
import type { Metadata } from "next";
import { ProductsView, ViewToggle } from "@/components/app/products-view";
import { FilterSelect, SearchInput } from "@/components/app/url-filters";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { CONDITION_OPTIONS } from "@/domain/product";
import { requireSession } from "@/server/auth/session";
import { getCategoryCatalog } from "@/server/services/catalog";
import { listProducts } from "@/server/services/products";
import { productListQuerySchema } from "@/validation/schemas";

export const metadata: Metadata = { title: "Mis productos" };

const SORT_OPTIONS = [
  { value: "created_desc", label: "Más recientes" },
  { value: "created_asc", label: "Más antiguos" },
  { value: "updated_desc", label: "Última modificación" },
  { value: "name_asc", label: "Nombre (A-Z)" },
  { value: "name_desc", label: "Nombre (Z-A)" },
  { value: "price_asc", label: "Precio: menor a mayor" },
  { value: "price_desc", label: "Precio: mayor a menor" },
];

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const context = await requireSession();
  // Parámetros no válidos en la URL vuelven a los valores por defecto en lugar de romper la página.
  const parsed = productListQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : productListQuerySchema.parse({});
  const [result, catalog] = await Promise.all([listProducts(context, query), getCategoryCatalog()]);
  const view = params.vista === "tarjetas" ? "tarjetas" : "tabla";
  const parents = catalog.categories.filter((category) => !category.parentId);
  const filtered = Boolean(query.q || query.category || query.condition || query.archived !== "active");

  return (
    <>
      <PageHeader
        title="Mis productos"
        description="Tu catálogo completo. Busca, filtra, selecciona varios productos para editarlos en lote o genera un anuncio desde cualquiera de ellos."
        actions={
          <ButtonLink href="/app/productos/nuevo" variant="brand">
            <Plus aria-hidden /> Nuevo producto
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Buscar por nombre, marca, modelo o SKU" className="min-w-56 flex-1" />
        <FilterSelect param="category" label="Categoría" allLabel="Todas las categorías" options={parents.map((category) => ({ value: category.id, label: category.name }))} className="w-full sm:w-52" />
        <FilterSelect param="condition" label="Estado" allLabel="Cualquier estado" options={CONDITION_OPTIONS} className="w-[calc(50%-0.25rem)] sm:w-44" />
        <FilterSelect param="archived" label="Archivo" options={[{ value: "", label: "Activos" }, { value: "archived", label: "Archivados" }, { value: "all", label: "Todos" }]} className="w-[calc(50%-0.25rem)] sm:w-36" />
        <FilterSelect param="sort" label="Ordenar" options={SORT_OPTIONS.map((option) => (option.value === "created_desc" ? { ...option, value: "" } : option))} className="flex-1 sm:w-52 sm:flex-none" />
        <ViewToggle />
      </div>

      {result.items.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState icon={PackageSearch} title="Sin resultados" description="Ningún producto coincide con la búsqueda o los filtros aplicados." action={<ButtonLink href="/app/productos" variant="secondary">Quitar filtros</ButtonLink>} />
          ) : (
            <EmptyState
              icon={PackageSearch}
              title="Tu catálogo está vacío"
              description="Añade tu primer producto para empezar a generar anuncios. Si ya tienes un inventario, puedes importarlo desde un CSV."
              action={
                <>
                  <ButtonLink href="/app/productos/nuevo">Añadir producto</ButtonLink>
                  <ButtonLink href="/app/masivo" variant="secondary">
                    Importar CSV
                  </ButtonLink>
                </>
              }
            />
          )}
        </Card>
      ) : (
        <>
          <ProductsView products={result.items} view={view} categories={catalog.categories.map((category) => ({ id: category.id, name: category.parentId ? `— ${category.name}` : category.name }))} />
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} basePath="/app/productos" params={{ q: query.q, category: query.category, condition: query.condition, archived: query.archived === "active" ? undefined : query.archived, sort: query.sort === "created_desc" ? undefined : query.sort, vista: view === "tarjetas" ? view : undefined }} noun="productos" />
        </>
      )}
    </>
  );
}
