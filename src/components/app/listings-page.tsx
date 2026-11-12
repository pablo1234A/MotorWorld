import { Heart, Megaphone, Sparkles } from "lucide-react";
import { ExportMenu, ListingsView } from "@/components/app/listings-view";
import { FilterSelect, SearchInput } from "@/components/app/url-filters";
import { ButtonLink } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { MARKETPLACE_OPTIONS } from "@/domain/marketplaces/profiles";
import { LISTING_STATUS_LABELS } from "@/domain/product";
import { requireSession } from "@/server/auth/session";
import { listListings } from "@/server/services/listings";
import { getUsage } from "@/server/services/usage";
import { listingListQuerySchema } from "@/validation/schemas";

/** Listado compartido por «Mis anuncios» y «Favoritos» (misma consulta paginada en servidor). */
export async function ListingsPage({ params, favorites }: { params: Record<string, string | undefined>; favorites: boolean }) {
  const context = await requireSession();
  const parsed = listingListQuerySchema.safeParse({ ...params, favorites: favorites ? "1" : "0" });
  const query = parsed.success ? parsed.data : listingListQuerySchema.parse({ favorites: favorites ? "1" : "0" });
  const [result, usage] = await Promise.all([listListings(context, query), getUsage(context.supabase, context.workspace.id)]);
  const basePath = favorites ? "/app/favoritos" : "/app/anuncios";
  const filtered = Boolean(query.q || query.status || query.platform || query.product);

  return (
    <>
      <PageHeader
        title={favorites ? "Favoritos" : "Mis anuncios"}
        description={favorites ? "Los anuncios que has marcado con el corazón, siempre a mano." : "Todos los anuncios guardados. Ábrelos para editarlos, recuperar versiones, copiarlos o exportarlos."}
        actions={
          <>
            {!favorites ? <ExportMenu allowedFormats={usage.features.exportFormats} filters={{ status: query.status, platform: query.platform }} /> : null}
            <ButtonLink href="/app/crear" variant="brand">
              <Sparkles aria-hidden /> Crear anuncio
            </ButtonLink>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Buscar por título" className="min-w-56 flex-1" />
        <FilterSelect param="status" label="Estado" allLabel={favorites ? "Cualquier estado" : "Borradores y preparados"} options={Object.entries(LISTING_STATUS_LABELS).map(([value, label]) => ({ value, label }))} className="w-[calc(50%-0.25rem)] sm:w-52" />
        <FilterSelect param="platform" label="Plataforma" allLabel="Todas las plataformas" options={MARKETPLACE_OPTIONS} className="w-[calc(50%-0.25rem)] sm:w-52" />
        <FilterSelect param="sort" label="Ordenar" options={[{ value: "", label: "Más recientes" }, { value: "updated_desc", label: "Última modificación" }, { value: "created_asc", label: "Más antiguos" }, { value: "title_asc", label: "Título (A-Z)" }]} className="w-full sm:w-52" />
      </div>

      {result.items.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState icon={Megaphone} title="Sin resultados" description="Ningún anuncio coincide con la búsqueda o los filtros." action={<ButtonLink href={basePath} variant="secondary">Quitar filtros</ButtonLink>} />
          ) : favorites ? (
            <EmptyState icon={Heart} title="Aún no tienes favoritos" description="Marca con el corazón los anuncios que quieras tener localizados, por ejemplo tus mejores plantillas de texto." action={<ButtonLink href="/app/anuncios" variant="secondary">Ver mis anuncios</ButtonLink>} />
          ) : (
            <EmptyState icon={Megaphone} title="Todavía no has guardado anuncios" description="Genera tu primer anuncio a partir de un producto. Podrás editarlo, guardarlo y recuperarlo aquí." action={<ButtonLink href="/app/crear">Crear anuncio</ButtonLink>} />
          )}
        </Card>
      ) : (
        <>
          <ListingsView
            listings={result.items.map((listing) => ({ id: listing.id, title: listing.title, description: listing.description, platform: listing.platform, status: listing.status, generation_method: listing.generation_method, updated_at: listing.updated_at, productName: listing.productName, product_id: listing.product_id, isFavorite: listing.isFavorite }))}
            allowedFormats={usage.features.exportFormats}
          />
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} basePath={basePath} params={{ q: query.q, status: query.status, platform: query.platform, product: query.product, sort: query.sort === "created_desc" ? undefined : query.sort }} noun="anuncios" />
        </>
      )}
    </>
  );
}
