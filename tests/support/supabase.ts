import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type Db = SupabaseClient<Database>;

export function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new Error("Faltan variables de Supabase para las pruebas de integración (.env.local o .env.test).");
  return { url, anon, service };
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient(): Db {
  const { url, service } = env();
  return createClient<Database>(url, service, options);
}

export function anonClient(): Db {
  const { url, anon } = env();
  return createClient<Database>(url, anon, options);
}

export type TestUser = { id: string; email: string; password: string; client: Db; workspaceId: string };

/** Crea un usuario confirmado y devuelve un cliente autenticado como él (RLS real). */
export async function createTestUser(label = "user"): Promise<TestUser> {
  const admin = adminClient();
  const email = `${label}-${randomUUID().slice(0, 8)}@pruebas.anunciapro.test`;
  const password = `Clave-${randomUUID().slice(0, 12)}1`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Prueba ${label}` } });
  if (created.error || !created.data.user) throw created.error ?? new Error("No se pudo crear el usuario");
  const client = anonClient();
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  const { data: workspace } = await client.from("workspaces").select("id").single();
  if (!workspace) throw new Error("El trigger no creó el espacio de trabajo");
  return { id: created.data.user.id, email, password, client, workspaceId: workspace.id };
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (user) await adminClient().auth.admin.deleteUser(user.id);
}

export async function setPlan(workspaceId: string, code: string) {
  const admin = adminClient();
  const { data: plan } = await admin.from("plans").select("id").eq("code", code).single();
  await admin.from("subscriptions").update({ plan_id: plan!.id, provider: code === "free" ? "none" : "manual" }).eq("workspace_id", workspaceId);
}

export async function createProduct(user: TestUser, name = "Producto de prueba") {
  const { data, error } = await user.client.from("products").insert({ workspace_id: user.workspaceId, name }).select().single();
  if (error) throw error;
  return data;
}
