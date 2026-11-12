"use client";

import { Archive, ArchiveRestore, Copy, LayoutGrid, List, MoreHorizontal, Package, Pencil, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { ConfirmDialog, Dialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/overlays";
import { Badge } from "@/components/ui/primitives";
import { CONDITION_OPTIONS, conditionLabel, type ConditionCode } from "@/domain/product";
import { api, errorMessage } from "@/lib/api-client";
import { cn, estimateMargin, formatDate, formatPrice } from "@/lib/utils";
import { useUrlFilters } from "./url-filters";

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  price: number | null;
  cost_price: number | null;
  currency: string;
  condition: string;
  condition_custom: string | null;
  archived_at: string | null;
  updated_at: string;
  categoryName: string | null;
  thumbnailUrl: string | null;
  listingCount: number;
};

type CategoryOption = { id: string; name: string };
type Pending = { type: "delete"; ids: string[] } | null;

function Thumb({ product, className }: { product: ProductRow; className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-sunken text-faint", className)}>
      {product.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Storage privado
        <img src={product.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <Package className="size-4" aria-hidden />
      )}
    </span>
  );
}

export function ViewToggle() {
  const { get, setParams } = useUrlFilters();
  const view = get("vista") === "tarjetas" ? "tarjetas" : "tabla";
  const item = (value: "tabla" | "tarjetas", Icon: typeof List, label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      aria-label={label}
      title={label}
      onClick={() => setParams({ vista: value === "tabla" ? undefined : value, page: get("page") || undefined })}
      className={cn("flex size-8 items-center justify-center rounded-lg", view === value ? "bg-ink text-white" : "text-muted hover:bg-sunken")}
    >
      <Icon className="size-4" />
    </button>
  );
  return (
    <div className="flex gap-1 rounded-[10px] border border-line-strong bg-surface p-0.5 shadow-card">
      {item("tabla", List, "Vista de tabla")}
      {item("tarjetas", LayoutGrid, "Vista de tarjetas")}
    </div>
  );
}

export function ProductsView({ products, view, categories }: { products: ProductRow[]; view: "tabla" | "tarjetas"; categories: CategoryOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({ categoryId: "", condition: "", brand: "", location: "" });

  const ids = [...selected].filter((id) => products.some((product) => product.id === id));
  const allSelected = products.length > 0 && ids.length === products.length;
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  async function bulk(body: Record<string, unknown>, success: (affected: number) => string) {
    setBusy(true);
    try {
      const result = await api<{ affected: number }>("/api/products/bulk", { body });
      toast.success(success(result.affected));
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(id: string) {
    try {
      const copy = await api<{ id: string }>(`/api/products/${id}/duplicate`, { method: "POST" });
      toast.success("Producto duplicado");
      router.push(`/app/productos/${copy.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

  const rowMenu = (product: ProductRow) => (
    <Menu>
      <MenuTrigger className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink" aria-label={`Acciones de ${product.name}`}>
        <MoreHorizontal className="size-4" />
      </MenuTrigger>
      <MenuContent>
        <MenuItem asChild>
          <Link href={`/app/crear?producto=${product.id}`}>
            <Sparkles /> Generar anuncio
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href={`/app/productos/${product.id}`}>
            <Pencil /> Editar
          </Link>
        </MenuItem>
        <MenuItem onSelect={() => duplicate(product.id)}>
          <Copy /> Duplicar
        </MenuItem>
        {product.archived_at ? (
          <MenuItem onSelect={() => bulk({ action: "restore", ids: [product.id] }, () => "Producto restaurado")}>
            <ArchiveRestore /> Restaurar
          </MenuItem>
        ) : (
          <MenuItem onSelect={() => bulk({ action: "archive", ids: [product.id] }, () => "Producto archivado")}>
            <Archive /> Archivar
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem danger onSelect={() => setPending({ type: "delete", ids: [product.id] })}>
          <Trash2 /> Eliminar
        </MenuItem>
      </MenuContent>
    </Menu>
  );

  const condition = (product: ProductRow) => conditionLabel(product.condition as ConditionCode, product.condition_custom);

  return (
    <>
      {ids.length > 0 ? (
        <div className="sticky top-[4.5rem] z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-ink bg-ink px-4 py-2.5 text-white shadow-raised" role="region" aria-label="Acciones en lote">
          <span className="mr-auto text-sm font-medium">{plural(ids.length, "producto seleccionado", "productos seleccionados")}</span>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
            <SlidersHorizontal aria-hidden /> Editar campos
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => bulk({ action: "archive", ids }, (n) => `${plural(n, "producto archivado", "productos archivados")}`)}>
            <Archive aria-hidden /> Archivar
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => bulk({ action: "restore", ids }, (n) => `${plural(n, "producto restaurado", "productos restaurados")}`)}>
            <ArchiveRestore aria-hidden /> Restaurar
          </Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => setPending({ type: "delete", ids })}>
            <Trash2 aria-hidden /> Eliminar
          </Button>
        </div>
      ) : null}

      {view === "tabla" ? (
        <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line bg-paper text-[12px] uppercase tracking-wider text-faint">
              <tr>
                <th className="w-10 px-4 py-3">
                  <Checkbox aria-label="Seleccionar todos" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(products.map((product) => product.id)))} />
                </th>
                <th className="px-2 py-3 font-semibold">Producto</th>
                <th className="px-3 py-3 font-semibold">Categoría</th>
                <th className="px-3 py-3 font-semibold">Estado</th>
                <th className="px-3 py-3 text-right font-semibold">Precio</th>
                <th className="px-3 py-3 text-right font-semibold">Margen</th>
                <th className="px-3 py-3 text-right font-semibold">Anuncios</th>
                <th className="px-3 py-3 font-semibold">Modificado</th>
                <th className="w-12 px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((product) => {
                const margin = estimateMargin(product.price, product.cost_price);
                return (
                  <tr key={product.id} className={cn("hover:bg-paper/70", selected.has(product.id) && "bg-brand-soft/40")}>
                    <td className="px-4 py-3">
                      <Checkbox aria-label={`Seleccionar ${product.name}`} checked={selected.has(product.id)} onChange={() => toggle(product.id)} />
                    </td>
                    <td className="px-2 py-3">
                      <Link href={`/app/productos/${product.id}`} className="flex items-center gap-3">
                        <Thumb product={product} className="size-10" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="block max-w-64 truncate font-medium hover:text-brand-strong">{product.name}</span>
                            {product.archived_at ? <Badge>Archivado</Badge> : null}
                          </span>
                          <span className="block text-xs text-muted">{[product.brand, product.sku ? `SKU ${product.sku}` : null].filter(Boolean).join(" · ") || "Sin referencia"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-muted">{product.categoryName ?? "—"}</td>
                    <td className="px-3 py-3 text-muted">{condition(product)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatPrice(product.price, product.currency)}</td>
                    <td className={cn("px-3 py-3 text-right tabular-nums", margin ? (margin.amount >= 0 ? "text-success" : "text-danger") : "text-faint")}>{margin ? formatPrice(margin.amount, product.currency) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted">{product.listingCount}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(product.updated_at)}</td>
                    <td className="px-2 py-3">{rowMenu(product)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <li key={product.id} className={cn("relative flex flex-col overflow-hidden rounded-card border bg-surface shadow-card", selected.has(product.id) ? "border-brand" : "border-line")}>
              <div className="absolute left-3 top-3 z-[1] rounded-md bg-surface/90 p-1">
                <Checkbox aria-label={`Seleccionar ${product.name}`} checked={selected.has(product.id)} onChange={() => toggle(product.id)} />
              </div>
              <Link href={`/app/productos/${product.id}`} className="block">
                <Thumb product={product} className="aspect-[4/3] w-full rounded-none border-0 border-b [&_svg]:size-8" />
              </Link>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/app/productos/${product.id}`} className="line-clamp-2 text-sm font-semibold hover:text-brand-strong">
                    {product.name}
                  </Link>
                  {rowMenu(product)}
                </div>
                <p className="mt-1 text-xs text-muted">{[product.categoryName, condition(product)].filter(Boolean).join(" · ")}</p>
                <div className="mt-auto flex items-end justify-between pt-4">
                  <span className="font-display text-lg font-semibold tabular-nums">{formatPrice(product.price, product.currency)}</span>
                  <span className="text-xs text-muted">{product.listingCount} {product.listingCount === 1 ? "anuncio" : "anuncios"}</span>
                </div>
                {product.archived_at ? <Badge className="mt-2 self-start">Archivado</Badge> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pending?.type === "delete"}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending && pending.ids.length > 1 ? `¿Eliminar ${pending.ids.length} productos?` : "¿Eliminar este producto?"}
        description="Se eliminarán también sus fotografías y todos los anuncios asociados. Esta acción no se puede deshacer. Si solo quieres ocultarlo, archívalo."
        confirmLabel="Eliminar definitivamente"
        onConfirm={async () => {
          if (pending) await bulk({ action: "delete", ids: pending.ids }, (n) => plural(n, "producto eliminado", "productos eliminados"));
        }}
      />

      <Dialog
        open={editing}
        onOpenChange={setEditing}
        title="Editar campos en lote"
        description={`Los campos que rellenes se aplicarán a ${plural(ids.length, "producto", "productos")}. Los vacíos no se modifican.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                const changes = Object.fromEntries(Object.entries(fields).filter(([, value]) => value.trim() !== ""));
                if (Object.keys(changes).length === 0) return void toast.error("Rellena al menos un campo.");
                await bulk({ action: "update", ids, fields: changes }, (n) => plural(n, "producto actualizado", "productos actualizados"));
                setEditing(false);
                setFields({ categoryId: "", condition: "", brand: "", location: "" });
              }}
            >
              Aplicar cambios
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoría" htmlFor="bulk-category">
            <Select id="bulk-category" value={fields.categoryId} onChange={(event) => setFields({ ...fields, categoryId: event.target.value })}>
              <option value="">No cambiar</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado" htmlFor="bulk-condition">
            <Select id="bulk-condition" value={fields.condition} onChange={(event) => setFields({ ...fields, condition: event.target.value })}>
              <option value="">No cambiar</option>
              {CONDITION_OPTIONS.filter((option) => option.value !== "custom").map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Marca" htmlFor="bulk-brand">
            <Input id="bulk-brand" value={fields.brand} maxLength={120} onChange={(event) => setFields({ ...fields, brand: event.target.value })} placeholder="No cambiar" />
          </Field>
          <Field label="Ubicación" htmlFor="bulk-location">
            <Input id="bulk-location" value={fields.location} maxLength={160} onChange={(event) => setFields({ ...fields, location: event.target.value })} placeholder="No cambiar" />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
