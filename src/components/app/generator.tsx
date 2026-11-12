"use client";

import { CheckCircle2, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/primitives";
import type { CategoryCatalog } from "@/domain/categories";
import { ListingEditor, type EditorOptions, type TemplateOption } from "./listing-editor";
import { ProductForm } from "./product-form";

type Props = {
  catalog: CategoryCatalog;
  templates: TemplateOption[];
  usage: { used: number; limit: number; remaining: number };
  providerLabel: string;
  maxImages: number;
  initialProduct: { id: string; name: string } | null;
  initialOptions: EditorOptions;
};

/** Flujo "Crear anuncio": 1) datos del producto → 2) generación y edición del anuncio. */
export function Generator({ catalog, templates, usage, providerLabel, maxImages, initialProduct, initialOptions }: Props) {
  const [product, setProduct] = useState(initialProduct);
  const [auto, setAuto] = useState(false);

  const steps = [
    { label: "Producto", done: Boolean(product) },
    { label: "Anuncio", done: false },
  ];

  return (
    <>
      <ol className="mb-6 flex items-center gap-3 text-sm" aria-label="Pasos">
        {steps.map((step, index) => {
          const current = product ? index === 1 : index === 0;
          return (
            <li key={step.label} className="flex items-center gap-3">
              {index > 0 ? <span className="h-px w-8 bg-line-strong" aria-hidden /> : null}
              <span className={`flex items-center gap-2 font-medium ${current ? "text-ink" : "text-muted"}`} aria-current={current ? "step" : undefined}>
                {step.done ? (
                  <CheckCircle2 className="size-5 text-success" aria-hidden />
                ) : (
                  <span className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${current ? "bg-ink text-white" : "bg-sunken text-muted"}`}>{index + 1}</span>
                )}
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {product ? (
        <>
          <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-faint">Producto</p>
              <p className="truncate text-base font-semibold">{product.name}</p>
            </div>
            <Link href={`/app/productos/${product.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-strong hover:underline">
              <Pencil className="size-3.5" aria-hidden /> Editar datos del producto
            </Link>
          </Card>
          <ListingEditor key={product.id} product={product} templates={templates} usage={usage} providerLabel={providerLabel} initialOptions={initialOptions} autoGenerate={auto} />
        </>
      ) : (
        <>
          <p className="mb-5 text-sm text-muted">
            Rellena los datos del producto y pulsa «Guardar y generar anuncio». ¿Ya lo tienes en tu catálogo?{" "}
            <Link href="/app/productos" className="font-medium text-brand-strong hover:underline">
              Elígelo en Mis productos
            </Link>{" "}
            y usa «Generar anuncio».
          </p>
          <ProductForm
            catalog={catalog}
            maxImages={maxImages}
            submitLabel={usage.remaining > 0 ? "Guardar y generar anuncio" : "Guardar producto"}
            onSaved={(saved) => {
              setAuto(usage.remaining > 0);
              setProduct({ id: saved.id, name: saved.name });
              window.scrollTo({ top: 0 });
            }}
          />
        </>
      )}
    </>
  );
}
