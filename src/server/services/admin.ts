import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import type { SessionContext } from "@/server/auth/session";
import { ApiError, notFound } from "@/server/http/errors";
import { fromDbError } from "@/server/http/handler";
import { sanitizeSearch } from "./products";

/**
 * Servicio del panel de administración. Usa service_role (omite RLS), por lo que
 * SOLO debe invocarse después de requireApiAdmin()/requireAdminPage().
 * No existe ninguna función para iniciar sesión como otro usuario ni para leer
 * credenciales: la administración consulta datos, no suplanta cuentas.
 */

const range = (page: number, pageSize: number) => [(page - 1) * pageSize, page * pageSize - 1] as const;
const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

async function count(table: "profiles" | "workspaces" | "products" | "listings" | "generation_jobs" | "contact_messages", filter?: (query: ReturnType<typeof base>) => ReturnType<typeof base>) {
  const query = base(table);
  const { count: total } = await (filter ? filter(query) : query);
  return total ?? 0;
}
function base(table: "profiles" | "workspaces" | "products" | "listings" | "generation_jobs" | "contact_messages") {
  return getAdminClient().from(table).select("id", { count: "exact", head: true });
}

export async function getAdminOverview() {
  const admin = getAdminClient();
  const since = monthStart();
  const [users, newUsers, workspaces, products, listings, listingsMonth, jobsActive, jobsFailed, pendingContact, usage, plans] = await Promise.all([
    count("profiles"),
    count("profiles", (q) => q.gte("created_at", since)),
    count("workspaces"),
    count("products"),
    count("listings"),
    count("listings", (q) => q.gte("created_at", since)),
    count("generation_jobs", (q) => q.in("status", ["pending", "processing"])),
    count("generation_jobs", (q) => q.in("status", ["failed", "partially_completed"])),
    count("contact_messages", (q) => q.is("handled_at", null)),
    admin.from("usage_records").select("quantity").gte("created_at", since).limit(100000),
    admin.from("subscriptions").select("status, plans(code, name)"),
  ]);
  const generationsMonth = (usage.data ?? []).reduce((sum, row) => sum + row.quantity, 0);
  const byPlan = new Map<string, number>();
  for (const row of plans.data ?? []) {
    const name = row.plans?.name ?? "—";
    byPlan.set(name, (byPlan.get(name) ?? 0) + 1);
  }
  return {
    users, newUsers, workspaces, products, listings, listingsMonth, jobsActive, jobsFailed, pendingContact,
    generationsMonth: Math.max(0, generationsMonth),
    workspacesByPlan: [...byPlan.entries()].map(([plan, total]) => ({ plan, total })).sort((a, b) => b.total - a.total),
  };
}

export async function adminListUsers(q: string | undefined, page: number, pageSize: number) {
  const admin = getAdminClient();
  const [from, to] = range(page, pageSize);
  let builder = admin.from("profiles").select("id, full_name, email, created_at, disabled_at, disabled_reason", { count: "exact" });
  const term = q ? sanitizeSearch(q) : "";
  if (term) builder = builder.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  const { data, error, count: total } = await builder.order("created_at", { ascending: false }).range(from, to);
  if (error) throw fromDbError(error);
  const ids = data.map((row) => row.id);
  const [workspaces, admins] = await Promise.all([
    ids.length ? admin.from("workspaces").select("id, name, owner_id, subscriptions(status, provider, plans(code, name))").in("owner_id", ids) : { data: [] },
    ids.length ? admin.from("platform_admins").select("user_id").in("user_id", ids) : { data: [] },
  ]);
  const adminIds = new Set((admins.data ?? []).map((row) => row.user_id));
  return {
    total: total ?? 0,
    items: data.map((user) => {
      const workspace = (workspaces.data ?? []).find((row) => row.owner_id === user.id);
      const subscription = workspace?.subscriptions;
      return {
        ...user,
        isAdmin: adminIds.has(user.id),
        workspaceId: workspace?.id ?? null,
        workspaceName: workspace?.name ?? null,
        planCode: subscription?.plans?.code ?? "free",
        planName: subscription?.plans?.name ?? "Free",
      };
    }),
  };
}

export async function adminListWorkspaces(page: number, pageSize: number) {
  const [from, to] = range(page, pageSize);
  const { data, error, count: total } = await getAdminClient()
    .from("workspaces")
    .select("id, name, created_at, profiles!workspaces_owner_id_fkey(email, full_name), subscriptions(status, provider, current_period_end, plans(code, name)), products(count), listings(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw fromDbError(error);
  return {
    total: total ?? 0,
    items: data.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      ownerEmail: row.profiles?.email ?? "—",
      planCode: row.subscriptions?.plans?.code ?? "free",
      planName: row.subscriptions?.plans?.name ?? "Free",
      provider: row.subscriptions?.provider ?? "none",
      status: row.subscriptions?.status ?? "active",
      products: row.products[0]?.count ?? 0,
      listings: row.listings[0]?.count ?? 0,
    })),
  };
}

export async function adminListJobs(page: number, pageSize: number) {
  const [from, to] = range(page, pageSize);
  const { data, error, count: total } = await getAdminClient()
    .from("generation_jobs")
    .select("id, status, source_filename, total_items, successful_items, failed_items, retry_count, created_at, completed_at, workspaces(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw fromDbError(error);
  return { total: total ?? 0, items: data };
}

/** Errores recientes: elementos fallidos de trabajos masivos y eventos de Stripe fallidos. */
export async function adminListErrors() {
  const admin = getAdminClient();
  const [items, events] = await Promise.all([
    admin.from("generation_job_items").select("id, job_id, row_number, error_message, system_error, updated_at").eq("status", "failed").order("updated_at", { ascending: false }).limit(50),
    admin.from("stripe_events").select("id, type, error_message, received_at").eq("status", "failed").order("received_at", { ascending: false }).limit(50),
  ]);
  return { jobItems: items.data ?? [], stripeEvents: events.data ?? [] };
}

export async function adminListUsage(page: number, pageSize: number) {
  const [from, to] = range(page, pageSize);
  const { data, error, count: total } = await getAdminClient()
    .from("usage_records")
    .select("id, operation_type, quantity, status, created_at, workspaces(name), profiles(email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw fromDbError(error);
  return { total: total ?? 0, items: data };
}

export async function adminListSubscriptions(page: number, pageSize: number) {
  const [from, to] = range(page, pageSize);
  const { data, error, count: total } = await getAdminClient()
    .from("subscriptions")
    .select("id, status, provider, provider_customer_id, provider_subscription_id, current_period_end, cancel_at_period_end, updated_at, workspaces(id, name), plans(code, name)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);
  if (error) throw fromDbError(error);
  return { total: total ?? 0, items: data };
}

export async function adminListAudit(page: number, pageSize: number) {
  const [from, to] = range(page, pageSize);
  const { data, error, count: total } = await getAdminClient()
    .from("audit_logs")
    .select("id, action, resource_type, resource_id, metadata, created_at, profiles(email), workspaces(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw fromDbError(error);
  return { total: total ?? 0, items: data };
}

/** Consulta de catálogo con campos limitados (sin costes ni datos internos del vendedor). */
export async function adminListProducts(q: string | undefined, page: number, pageSize: number) {
  const [from, to] = range(page, pageSize);
  let builder = getAdminClient().from("products").select("id, name, brand, price, currency, condition, created_at, archived_at, workspaces(name)", { count: "exact" });
  const term = q ? sanitizeSearch(q) : "";
  if (term) builder = builder.ilike("name", `%${term}%`);
  const { data, error, count: total } = await builder.order("created_at", { ascending: false }).range(from, to);
  if (error) throw fromDbError(error);
  return { total: total ?? 0, items: data };
}

export async function adminListListings(q: string | undefined, page: number, pageSize: number) {
  const [from, to] = range(page, pageSize);
  let builder = getAdminClient().from("listings").select("id, title, platform, status, generation_method, created_at, workspaces(name)", { count: "exact" });
  const term = q ? sanitizeSearch(q) : "";
  if (term) builder = builder.ilike("title", `%${term}%`);
  const { data, error, count: total } = await builder.order("created_at", { ascending: false }).range(from, to);
  if (error) throw fromDbError(error);
  return { total: total ?? 0, items: data };
}

export async function adminListPlans() {
  const { data, error } = await getAdminClient().from("plans").select("*").order("display_order");
  if (error) throw fromDbError(error);
  return data;
}

export async function adminListContactMessages(page: number, pageSize: number) {
  const [from, to] = range(page, pageSize);
  const { data, error, count: total } = await getAdminClient()
    .from("contact_messages")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw fromDbError(error);
  return { total: total ?? 0, items: data };
}

async function adminAudit(actor: SessionContext, action: string, resourceType: string, resourceId: string, workspaceId: string | null, metadata: Record<string, Json>) {
  await getAdminClient().from("audit_logs").insert({ workspace_id: workspaceId, actor_id: actor.user.id, action, resource_type: resourceType, resource_id: resourceId, metadata });
}

/** Desactiva o reactiva una cuenta. La desactivación exige una causa, que queda auditada. */
export async function adminSetUserDisabled(actor: SessionContext, userId: string, disabled: boolean, reason?: string) {
  if (userId === actor.user.id) throw new ApiError("conflict", "No puedes desactivar tu propia cuenta.");
  const admin = getAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!profile) throw notFound("El usuario");
  const { data: targetIsAdmin } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (targetIsAdmin && disabled) throw new ApiError("conflict", "No se puede desactivar a otro administrador desde el panel.");

  // 1) Bloquea nuevos inicios de sesión y renovaciones de token en Supabase Auth.
  const banned = await admin.auth.admin.updateUserById(userId, { ban_duration: disabled ? "876000h" : "none" });
  if (banned.error) throw new ApiError("internal_error", "No se pudo actualizar el estado de la cuenta.");
  // 2) Corta de inmediato el acceso a datos: las políticas RLS excluyen perfiles desactivados.
  const { error } = await admin
    .from("profiles")
    .update({ disabled_at: disabled ? new Date().toISOString() : null, disabled_reason: disabled ? (reason ?? null) : null })
    .eq("id", userId);
  if (error) throw fromDbError(error);
  await adminAudit(actor, disabled ? "admin.user_disabled" : "admin.user_enabled", "user", userId, null, disabled ? { reason: reason ?? "" } : {});
}

/** Asignación manual de plan (soporte, pruebas o acuerdos). No aplica a suscripciones gestionadas por Stripe. */
export async function adminSetWorkspacePlan(actor: SessionContext, workspaceId: string, planCode: string, reason: string) {
  const admin = getAdminClient();
  const [{ data: plan }, { data: subscription }] = await Promise.all([
    admin.from("plans").select("id, code").eq("code", planCode).maybeSingle(),
    admin.from("subscriptions").select("id, provider, status").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (!plan) throw new ApiError("validation_error", "El plan indicado no existe.");
  if (!subscription) throw notFound("El espacio de trabajo");
  if (subscription.provider === "stripe" && ["active", "trialing", "past_due"].includes(subscription.status)) {
    throw new ApiError("conflict", "Este espacio tiene una suscripción activa de Stripe: el plan se gestiona desde Stripe.");
  }
  const { error } = await admin
    .from("subscriptions")
    .update({ plan_id: plan.id, status: "active", provider: plan.code === "free" ? "none" : "manual", current_period_start: null, current_period_end: null, cancel_at_period_end: false })
    .eq("workspace_id", workspaceId);
  if (error) throw fromDbError(error);
  await adminAudit(actor, "admin.plan_assigned", "subscription", subscription.id, workspaceId, { plan: plan.code, reason });
}

export async function adminUpdatePlan(
  actor: SessionContext,
  planId: string,
  input: { name: string; price: number; monthlyListingLimit: number; monthlyBulkLimit: number; maxProducts: number; maxTemplates: number; maxBulkRows: number; maxImagesPerProduct: number; isActive: boolean },
) {
  const admin = getAdminClient();
  const { data: plan } = await admin.from("plans").select("*").eq("id", planId).maybeSingle();
  if (!plan) throw notFound("El plan");
  if (plan.code === "free" && !input.isActive) throw new ApiError("conflict", "El plan gratuito no se puede desactivar.");
  const features = {
    ...((plan.features ?? {}) as Record<string, Json>),
    max_products: input.maxProducts,
    max_templates: input.maxTemplates,
    max_bulk_rows: input.maxBulkRows,
    max_images_per_product: input.maxImagesPerProduct,
  };
  const { error } = await admin
    .from("plans")
    .update({ name: input.name, price: input.price, monthly_listing_limit: input.monthlyListingLimit, monthly_bulk_limit: input.monthlyBulkLimit, features, is_active: input.isActive })
    .eq("id", planId);
  if (error) throw fromDbError(error);
  await adminAudit(actor, "admin.plan_updated", "plan", planId, null, { code: plan.code, monthly_listing_limit: input.monthlyListingLimit, monthly_bulk_limit: input.monthlyBulkLimit, price: input.price });
}

export async function adminSetContactHandled(actor: SessionContext, id: string, handled: boolean) {
  const { data, error } = await getAdminClient()
    .from("contact_messages")
    .update({ handled_at: handled ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw notFound("El mensaje");
  await adminAudit(actor, handled ? "admin.contact_handled" : "admin.contact_reopened", "contact_message", id, null, {});
}
