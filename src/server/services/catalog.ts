import "server-only";
import { cache } from "react";
import type { AttributeDefinition, CategoryCatalog } from "@/domain/categories";
import type { AttributeType } from "@/domain/product";
import type { Db } from "@/lib/supabase/types";
import { slugify } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/server/auth/session";
import { ApiError, notFound } from "@/server/http/errors";
import { fromDbError } from "@/server/http/handler";

/** Carga categorías (del sistema + personalizadas del workspace) y sus atributos en dos consultas. */
export async function loadCategoryCatalog(supabase: Db): Promise<CategoryCatalog> {
  const [categories, attributes] = await Promise.all([
    supabase.from("categories").select("id, name, slug, parent_id, workspace_id").eq("is_active", true).order("display_order").order("name"),
    supabase.from("category_attributes").select("*").order("display_order"),
  ]);
  if (categories.error) throw fromDbError(categories.error);
  if (attributes.error) throw fromDbError(attributes.error);
  return {
    categories: categories.data.map((row) => ({ id: row.id, name: row.name, slug: row.slug, parentId: row.parent_id, isCustom: row.workspace_id !== null })),
    attributes: attributes.data.map(
      (row): AttributeDefinition => ({
        categoryId: row.category_id,
        key: row.attribute_key,
        name: row.attribute_name,
        type: row.attribute_type as AttributeType,
        required: row.is_required,
        options: Array.isArray(row.options) ? row.options.map(String) : [],
        unit: row.unit,
        showInTitle: row.show_in_title,
        order: row.display_order,
      }),
    ),
  };
}

/** Versión memorizada por petición para Server Components y servicios. */
export const getCategoryCatalog = cache(async (): Promise<CategoryCatalog> => loadCategoryCatalog(await createClient()));

export async function createCustomCategory(context: SessionContext, input: { name: string; parentId: string | null }) {
  const slug = slugify(input.name);
  if (!slug) throw new ApiError("validation_error", "El nombre de la categoría no es válido.");
  const { data, error } = await context.supabase
    .from("categories")
    .insert({ workspace_id: context.workspace.id, name: input.name, slug, parent_id: input.parentId, display_order: 500 })
    .select("id, name, slug, parent_id")
    .single();
  if (error) throw error.code === "23505" ? new ApiError("conflict", "Ya tienes una categoría con ese nombre.") : fromDbError(error);
  return data;
}

export async function deleteCustomCategory(context: SessionContext, id: string) {
  const { data, error } = await context.supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("workspace_id", context.workspace.id)
    .select("id");
  if (error) throw fromDbError(error);
  if (!data?.length) throw notFound("La categoría");
}
