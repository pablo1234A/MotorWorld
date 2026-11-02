"use client";

import { AssetGrid } from "@/components/library";
import { GenerationCard } from "@/components/jobs";
import { PageHeader, Section } from "@/components/ui";
import { useGenerations } from "@/lib/hooks";

export default function FavoritesPage() {
  const saved = useGenerations({ saved: true, limit: 30 });
  return (
    <div>
      <PageHeader eyebrow="Favoritos" title={<>Lo <em className="text-muted">mejor</em> de tu trabajo</>}>Archivos marcados como favoritos y generaciones guardadas.</PageHeader>
      <Section title="Archivos favoritos"><AssetGrid filters={{ favorite: true }} allowUpload={false} /></Section>
      {!!saved.data?.items.length && (
        <Section title="Generaciones guardadas">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{saved.data.items.map((g) => <GenerationCard key={g.id} g={g} />)}</div>
        </Section>
      )}
    </div>
  );
}
