import "server-only";
import { resolveProfile, type MarketplaceProfile, type TemplateConfiguration } from "@/domain/marketplaces/profiles";
import type { Db, Json, Row } from "@/lib/supabase/types";
import { assertCanEdit, type SessionContext } from "@/server/auth/session";
import { ApiError, notFound } from "@/server/http/errors";
import { fromDbError } from "@/server/http/handler";
import type { TemplateInput } from "@/validation/schemas";

export async function listTemplates(context: SessionContext): Promise<Row<"templates">[]> {
  const { data, error } = await context.supabase
    .from("templates")
    .select("*")
    .eq("workspace_id", context.workspace.id)
    .order("created_at", { ascending: false });
  if (error) throw fromDbError(error);
  return data;
}

export async function createTemplate(context: SessionContext, input: TemplateInput) {
  assertCanEdit(context);
  const { data, error } = await context.supabase
    .from("templates")
    .insert({
      workspace_id: context.workspace.id,
      created_by: context.user.id,
      name: input.name,
      platform: input.platform,
      category_id: input.categoryId,
      configuration: input.configuration as { [key: string]: Json },
      is_active: input.isActive,
    })
    .select()
    .single();
  if (error) throw fromDbError(error, "No se pudo crear la plantilla.");
  return data;
}

export async function updateTemplate(context: SessionContext, id: string, input: TemplateInput) {
  assertCanEdit(context);
  const { data, error } = await context.supabase
    .from("templates")
    .update({ name: input.name, platform: input.platform, category_id: input.categoryId, configuration: input.configuration as { [key: string]: Json }, is_active: input.isActive })
    .eq("id", id)
    .eq("workspace_id", context.workspace.id)
    .select()
    .maybeSingle();
  if (error) throw fromDbError(error, "No se pudo guardar la plantilla.");
  if (!data) throw notFound("La plantilla");
  return data;
}

export async function deleteTemplate(context: SessionContext, id: string) {
  assertCanEdit(context);
  const { data, error } = await context.supabase.from("templates").delete().eq("id", id).eq("workspace_id", context.workspace.id).select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw notFound("La plantilla");
}

/**
 * Resuelve el perfil de presentación efectivo: perfil base de la plataforma más,
 * si se indica, la configuración de una plantilla del propio workspace.
 */
export async function resolveListingProfile(
  supabase: Db,
  workspaceId: string,
  platform: string,
  templateId: string | null,
): Promise<{ profile: MarketplaceProfile; platform: string; templateId: string | null }> {
  if (!templateId) return { profile: resolveProfile(platform), platform, templateId: null };
  const { data, error } = await supabase.from("templates").select("*").eq("id", templateId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw notFound("La plantilla");
  if (!data.is_active) throw new ApiError("validation_error", "La plantilla seleccionada está desactivada.");
  return {
    profile: resolveProfile(data.platform, data.configuration as TemplateConfiguration, data.name),
    platform: data.platform,
    templateId: data.id,
  };
}
