"use client";

import { useQuery } from "@tanstack/react-query";
import { AssetGrid } from "@/components/library";
import { PageHeader } from "@/components/ui";
import { api, fmtBytes } from "@/lib/api";

export default function LibraryPage() {
  const usage = useQuery<any>({ queryKey: ["storage-usage"], queryFn: () => api("/api/assets/usage") });
  const pct = usage.data ? Math.min(100, (usage.data.used_bytes / usage.data.quota_bytes) * 100) : 0;
  return (
    <div>
      <PageHeader eyebrow="Biblioteca personal" title={<>Tu <em className="text-muted">biblioteca</em></>}
        actions={usage.data && (
          <div className="w-56">
            <p className="mb-1 text-right font-mono text-[11px] text-muted">{fmtBytes(usage.data.used_bytes)} / {fmtBytes(usage.data.quota_bytes)}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
          </div>
        )}>
        Todos tus archivos: subidos, generados, editados y renderizados. Solo tú puedes verlos.
      </PageHeader>
      <AssetGrid filters={{}} />
    </div>
  );
}
