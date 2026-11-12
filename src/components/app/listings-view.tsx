"use client";

import { Copy, Download, Heart, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "@/components/ui/copy-button";
import { Checkbox, Select } from "@/components/ui/form";
import { ConfirmDialog, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/overlays";
import { Badge } from "@/components/ui/primitives";
import { platformName } from "@/domain/marketplaces/profiles";
import { EXPORT_FORMATS, EXPORT_FORMAT_LABELS, type ExportFormat } from "@/domain/plans";
import { LISTING_STATUS_LABELS, type ListingStatus } from "@/domain/product";
import { htmlToPlain, looksLikeHtml } from "@/domain/text";
import { api, errorMessage } from "@/lib/api-client";
import { cn, formatDate } from "@/lib/utils";

export type ListingRow = { id: string; title: string; description: string; platform: string; status: string; generation_method: string; updated_at: string; productName: string; product_id: string; isFavorite: boolean };

/** Descarga un archivo de la API mostrando el error de negocio (plan, límites) si lo hay. */
export async function downloadFromApi(url: string) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? "No se pudo generar la exportación.");
  }
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "exportacion";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function ExportMenu({ allowedFormats, ids, filters, label = "Exportar" }: { allowedFormats: ExportFormat[]; ids?: string[]; filters?: Record<string, string | undefined>; label?: string }) {
  const [busy, setBusy] = useState(false);
  async function run(format: ExportFormat) {
    setBusy(true);
    try {
      const params = new URLSearchParams({ format });
      if (ids?.length) params.set("ids", ids.join(","));
      for (const [key, value] of Object.entries(filters ?? {})) if (value) params.set(key, value);
      await downloadFromApi(`/api/listings/export?${params.toString()}`);
      toast.success("Exportación descargada");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" size={ids ? "sm" : "md"} loading={busy}>
          <Download aria-hidden /> {label}
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{ids?.length ? `${ids.length} seleccionados` : "Anuncios filtrados (máx. 1000)"}</MenuLabel>
        {EXPORT_FORMATS.map((format) => {
          const allowed = allowedFormats.includes(format);
          return (
            <MenuItem key={format} disabled={!allowed} onSelect={() => run(format)}>
              {EXPORT_FORMAT_LABELS[format]}
              {!allowed ? <span className="ml-auto text-xs text-faint">No incluido en tu plan</span> : null}
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}

export function ListingsView({ listings, allowedFormats }: { listings: ListingRow[]; allowedFormats: ExportFormat[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<string[] | null>(null);

  const ids = [...selected].filter((id) => listings.some((listing) => listing.id === id));
  const allSelected = listings.length > 0 && ids.length === listings.length;
  const isFavorite = (listing: ListingRow) => favorites[listing.id] ?? listing.isFavorite;

  async function toggleFavorite(listing: ListingRow) {
    const next = !isFavorite(listing);
    setFavorites((current) => ({ ...current, [listing.id]: next }));
    try {
      await api(`/api/listings/${listing.id}/favorite`, { method: next ? "PUT" : "DELETE" });
      router.refresh();
    } catch (error) {
      setFavorites((current) => ({ ...current, [listing.id]: !next }));
      toast.error(errorMessage(error));
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await api(`/api/listings/${id}`, { method: "PATCH", body: { status } });
      toast.success("Estado actualizado");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function duplicate(id: string) {
    try {
      const copy = await api<{ id: string }>(`/api/listings/${id}/duplicate`, { method: "POST" });
      toast.success("Anuncio duplicado");
      router.push(`/app/anuncios/${copy.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function remove(targets: string[]) {
    let removed = 0;
    for (const id of targets) {
      try {
        await api(`/api/listings/${id}`, { method: "DELETE" });
        removed += 1;
      } catch (error) {
        toast.error(errorMessage(error));
      }
    }
    if (removed) toast.success(removed === 1 ? "Anuncio eliminado" : `${removed} anuncios eliminados`);
    setSelected(new Set());
    router.refresh();
  }

  const plain = (text: string) => (looksLikeHtml(text) ? htmlToPlain(text) : text);

  return (
    <>
      {ids.length > 0 ? (
        <div className="sticky top-[4.5rem] z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-ink bg-ink px-4 py-2.5 text-white shadow-raised" role="region" aria-label="Acciones en lote">
          <span className="mr-auto text-sm font-medium">{ids.length === 1 ? "1 anuncio seleccionado" : `${ids.length} anuncios seleccionados`}</span>
          <ExportMenu allowedFormats={allowedFormats} ids={ids} label="Exportar selección" />
          <Button size="sm" variant="danger" onClick={() => setDeleting(ids)}>
            <Trash2 aria-hidden /> Eliminar
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex items-center gap-3 border-b border-line bg-paper px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-faint">
          <Checkbox aria-label="Seleccionar todos" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(listings.map((listing) => listing.id)))} />
          Anuncio
        </div>
        <ul className="divide-y divide-line">
          {listings.map((listing) => (
            <li key={listing.id} className={cn("flex items-start gap-3 px-4 py-3.5 hover:bg-paper/70", selected.has(listing.id) && "bg-brand-soft/40")}>
              <Checkbox
                className="mt-1"
                aria-label={`Seleccionar ${listing.title}`}
                checked={selected.has(listing.id)}
                onChange={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(listing.id)) next.delete(listing.id);
                    else next.add(listing.id);
                    return next;
                  })
                }
              />
              <div className="min-w-0 flex-1">
                <Link href={`/app/anuncios/${listing.id}`} className="block truncate text-sm font-semibold hover:text-brand-strong">
                  {listing.title}
                </Link>
                <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{plain(listing.description).replace(/\s+/g, " ")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge>{platformName(listing.platform)}</Badge>
                  <Badge tone={listing.status === "ready" ? "success" : listing.status === "archived" ? "warning" : "neutral"}>{LISTING_STATUS_LABELS[listing.status as ListingStatus] ?? listing.status}</Badge>
                  <Link href={`/app/productos/${listing.product_id}`} className="truncate hover:text-ink hover:underline">
                    {listing.productName}
                  </Link>
                  <span aria-hidden>·</span>
                  <span>{formatDate(listing.updated_at)}</span>
                </div>
              </div>
              <button type="button" onClick={() => toggleFavorite(listing)} aria-pressed={isFavorite(listing)} aria-label={isFavorite(listing) ? "Quitar de favoritos" : "Guardar como favorito"} className="rounded-lg p-2 text-muted hover:bg-sunken">
                <Heart className={cn("size-4", isFavorite(listing) && "fill-brand text-brand")} />
              </button>
              <Menu>
                <MenuTrigger className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink" aria-label={`Acciones de ${listing.title}`}>
                  <MoreHorizontal className="size-4" />
                </MenuTrigger>
                <MenuContent>
                  <MenuItem asChild>
                    <Link href={`/app/anuncios/${listing.id}`}>
                      <Pencil /> Abrir y editar
                    </Link>
                  </MenuItem>
                  <MenuItem onSelect={() => copyText(`${listing.title}\n\n${plain(listing.description)}`, "Anuncio copiado")}>
                    <Copy /> Copiar anuncio
                  </MenuItem>
                  <MenuItem onSelect={() => duplicate(listing.id)}>
                    <Copy /> Duplicar
                  </MenuItem>
                  <MenuSeparator />
                  <div className="px-2.5 py-1.5">
                    <Select aria-label="Cambiar estado" value={listing.status} onChange={(event) => setStatus(listing.id, event.target.value)} className="h-8 text-[13px]">
                      {(Object.keys(LISTING_STATUS_LABELS) as ListingStatus[]).map((status) => (
                        <option key={status} value={status}>
                          {LISTING_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => setDeleting([listing.id])}>
                    <Trash2 /> Eliminar
                  </MenuItem>
                </MenuContent>
              </Menu>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting && deleting.length > 1 ? `¿Eliminar ${deleting.length} anuncios?` : "¿Eliminar este anuncio?"}
        description="Se eliminarán junto con su historial de versiones. Los productos no se borran. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (deleting) await remove(deleting);
        }}
      />
    </>
  );
}
