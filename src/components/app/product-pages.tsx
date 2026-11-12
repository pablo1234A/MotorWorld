"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CategoryCatalog } from "@/domain/categories";
import type { ProductFormValues } from "@/validation/schemas";
import { ProductForm, type FormImage } from "./product-form";

/** Envoltorios de cliente que conectan el formulario con la navegación de cada página. */
export function NewProductForm({ catalog, maxImages }: { catalog: CategoryCatalog; maxImages: number }) {
  const router = useRouter();
  return (
    <ProductForm
      catalog={catalog}
      maxImages={maxImages}
      submitLabel="Guardar producto"
      onSaved={(product) => {
        toast.success("Producto guardado");
        router.push(`/app/productos/${product.id}`);
        router.refresh();
      }}
    />
  );
}

export function EditProductForm({ catalog, maxImages, productId, defaults, images }: { catalog: CategoryCatalog; maxImages: number; productId: string; defaults: Partial<ProductFormValues>; images: FormImage[] }) {
  const router = useRouter();
  return (
    <ProductForm
      catalog={catalog}
      maxImages={maxImages}
      product={{ id: productId }}
      defaults={defaults}
      images={images}
      submitLabel="Guardar cambios"
      onSaved={() => {
        toast.success("Cambios guardados");
        router.refresh();
      }}
    />
  );
}
