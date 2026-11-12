import type { Row } from "@/lib/supabase/types";
import type { ProductFormValues } from "@/validation/schemas";

/** Convierte una fila de producto en los valores iniciales del formulario. */
export function productToFormValues(product: Row<"products">): Partial<ProductFormValues> {
  return {
    name: product.name,
    description: product.description,
    categoryId: product.category_id,
    brand: product.brand ?? "",
    model: product.model ?? "",
    price: product.price === null ? "" : String(product.price).replace(".", ","),
    currency: product.currency as ProductFormValues["currency"],
    costPrice: product.cost_price === null ? "" : String(product.cost_price).replace(".", ","),
    condition: product.condition as ProductFormValues["condition"],
    conditionCustom: product.condition_custom ?? "",
    sku: product.sku ?? "",
    location: product.location ?? "",
    features: Array.isArray(product.features) ? product.features.map(String) : [],
    defects: product.defects,
    attributes: (product.attributes ?? {}) as ProductFormValues["attributes"],
  };
}
