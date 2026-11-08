import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Storage desde el servidor (clave secreta: NUNCA llega al
 * navegador). Los buckets son privados; la ruta empieza siempre por el id de
 * la organización (ver migración 1300).
 */

export type Bucket = "org-assets" | "imports" | "documents";

let client: SupabaseClient | null = null;

function storage() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("storage_not_configured");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client.storage;
}

export async function putObject(bucket: Bucket, path: string, body: Buffer, contentType: string): Promise<void> {
  const { error } = await storage().from(bucket).upload(path, body, { contentType, upsert: true, cacheControl: "3600" });
  if (error) throw new Error(`storage_upload_failed: ${error.message}`);
}

export async function getObject(bucket: Bucket, path: string): Promise<{ body: Buffer; contentType: string } | null> {
  const { data, error } = await storage().from(bucket).download(path);
  if (error || !data) return null;
  return { body: Buffer.from(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
}

export async function removeObject(bucket: Bucket, path: string): Promise<void> {
  const { error } = await storage().from(bucket).remove([path]);
  if (error) throw new Error(`storage_remove_failed: ${error.message}`);
}

/** URL firmada de corta duración (por defecto 60 s) para descargar un archivo privado. */
export async function signedUrl(bucket: Bucket, path: string, expiresInSeconds = 60, downloadName?: string): Promise<string> {
  const { data, error } = await storage().from(bucket).createSignedUrl(path, expiresInSeconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new Error(`storage_sign_failed: ${error?.message ?? "sin url"}`);
  return data.signedUrl;
}
