"use client";
import dynamic from "next/dynamic";
import type { SiteDocument } from "@/engine/schema";

/**
 * The editor store is a module-level singleton, so the editor must never render on the
 * server (that would share state between concurrent requests). It mounts client-side only.
 */
const Editor = dynamic(() => import("./editor").then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <div className="grid h-dvh place-items-center bg-bg text-[13px] text-muted" role="status">
      <span className="flex items-center gap-2">
        <span className="inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent" /> Abriendo el editor…
      </span>
    </div>
  ),
});

export function EditorClient(props: { project: { id: string; slug: string; name: string; revision: number; doc: SiteDocument; publishedAt: string | null } }) {
  return <Editor {...props} />;
}
