/**
 * Concede o retira el rol de administrador de plataforma: único método previsto.
 *   pnpm admin:grant correo@dominio.com          → concede
 *   pnpm admin:grant correo@dominio.com --revoke → retira
 * Requiere SUPABASE_SERVICE_ROLE_KEY. No existe ningún endpoint ni campo editable para ello.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const [email, flag] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error("Uso: pnpm admin:grant <correo> [--revoke]  (requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const { data: profile } = await admin.from("profiles").select("id, email").eq("email", email.toLowerCase()).maybeSingle();
if (!profile) {
  console.error(`No existe ninguna cuenta con el correo ${email}. El usuario debe registrarse primero.`);
  process.exit(1);
}
if (flag === "--revoke") {
  await admin.from("platform_admins").delete().eq("user_id", profile.id);
  await admin.from("audit_logs").insert({ action: "admin.role_revoked", resource_type: "user", resource_id: profile.id, metadata: { via: "cli" } });
  console.log(`Rol de administrador retirado a ${profile.email}.`);
} else {
  const { error } = await admin.from("platform_admins").upsert({ user_id: profile.id, note: "Concedido mediante scripts/grant-admin.mts" });
  if (error) throw error;
  await admin.from("audit_logs").insert({ action: "admin.role_granted", resource_type: "user", resource_id: profile.id, metadata: { via: "cli" } });
  console.log(`${profile.email} es ahora administrador de la plataforma.`);
}
