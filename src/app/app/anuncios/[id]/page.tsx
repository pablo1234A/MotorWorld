import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingEditor } from "@/components/app/listing-editor";
import { Notice } from "@/components/ui/primitives";
import { generationProviderInfo } from "@/domain/generation/registry";
import type { Language, ListingStatus, Tone } from "@/domain/product";
import { isUuid } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";
import { ApiError } from "@/server/http/errors";
import { getQualityFacts } from "@/server/services/generation";
import { getListing, listingContent } from "@/server/services/listings";
import { listTemplates, resolveListingProfile } from "@/server/services/templates";
import { getUsage } from "@/server/services/usage";

export const metadata: Metadata = { title: "Anuncio" };

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const context = await requireSession();
  const listing = await getListing(context, id).catch((error) => {
    if (error instanceof ApiError && error.code === "not_found") notFound();
    throw error;
  });
  const [usage, templates, facts, resolved] = await Promise.all([
    getUsage(context.supabase, context.workspace.id),
    listTemplates(context),
    getQualityFacts(context, listing.product.id),
    resolveListingProfile(context.supabase, context.workspace.id, listing.platform, listing.template_id).catch(() => resolveListingProfile(context.supabase, context.workspace.id, listing.platform, null)),
  ]);

  return (
    <>
      <Link href="/app/anuncios" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden /> Mis anuncios
      </Link>
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold leading-tight">Editar anuncio</h1>
        <p className="mt-1.5 text-sm text-muted">
          Producto:{" "}
          <Link href={`/app/productos/${listing.product.id}`} className="font-medium text-brand-strong hover:underline">
            {listing.product.name}
          </Link>
        </p>
      </div>
      {listing.product.archived_at ? (
        <Notice tone="warning" className="mb-5">
          El producto de este anuncio está archivado.
        </Notice>
      ) : null}
      <ListingEditor
        key={`${listing.id}-${listing.current_version}`}
        product={{ id: listing.product.id, name: listing.product.name }}
        templates={templates.filter((template) => template.is_active).map((template) => ({ id: template.id, name: template.name, platform: template.platform }))}
        usage={{ used: usage.used, limit: usage.monthlyListingLimit, remaining: usage.remaining }}
        providerLabel={generationProviderInfo().label}
        initialOptions={{ platform: listing.platform, templateId: listing.template_id, tone: listing.tone as Tone, length: resolved.profile.defaultLength ?? "medium", language: listing.language as Language, titleVariant: 0 }}
        facts={facts}
        saved={{
          id: listing.id,
          content: listingContent(listing),
          status: listing.status as ListingStatus,
          isFavorite: listing.isFavorite,
          method: listing.generation_method,
          version: listing.current_version,
          updatedAt: listing.updated_at,
          profile: { name: resolved.profile.name, titleMaxLength: resolved.profile.titleMaxLength, descriptionMaxLength: resolved.profile.descriptionMaxLength, rules: resolved.profile.rules },
        }}
      />
    </>
  );
}
