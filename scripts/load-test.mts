/**
 * Prueba de carga local: `pnpm test:load`
 * Requiere Supabase local y el servidor de producción (`pnpm build && pnpm start`).
 * Mide el rendimiento de UNA instancia en la máquina donde se ejecuta: sirve para
 * detectar regresiones y cuellos de botella, no como cifra de capacidad en producción.
 */
import { randomUUID } from "node:crypto";
import autocannon from "autocannon";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("La prueba de carga solo se ejecuta contra un Supabase local.");

const admin = createClient(url, service, { auth: { persistSession: false } });
const email = `carga-${randomUUID().slice(0, 8)}@pruebas.anunciapro.test`;
const password = `Carga-${randomUUID().slice(0, 10)}1`;
const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Prueba de carga" } });
if (error || !created.user) throw error;
const userId = created.user.id;

try {
  const { data: workspace } = await admin.from("workspaces").select("id").eq("owner_id", userId).single();
  const { data: plan } = await admin.from("plans").select("id").eq("code", "business").single();
  await admin.from("subscriptions").update({ plan_id: plan!.id, provider: "manual" }).eq("workspace_id", workspace!.id);
  // Catálogo de 2.000 productos para medir la paginación y la búsqueda con datos.
  for (let batch = 0; batch < 4; batch += 1) {
    const rows = Array.from({ length: 500 }, (_, index) => ({ workspace_id: workspace!.id, name: `Producto de carga ${batch * 500 + index}`, brand: `Marca ${index % 40}`, price: 10 + (index % 90), sku: `LOAD-${batch}-${index}` }));
    const inserted = await admin.from("products").insert(rows);
    if (inserted.error) throw inserted.error;
  }

  const jar = new Map<string, string>();
  const client = createServerClient(url, anon, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, encodeURIComponent(value)) : jar.delete(name))) },
  });
  await client.auth.signInWithPassword({ email, password });
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

  const scenarios: { name: string; path: string; headers?: Record<string, string> }[] = [
    { name: "Landing (pública)", path: "/" },
    { name: "Salud (/api/health)", path: "/api/health" },
    { name: "API: listado paginado (2.000 productos)", path: "/api/products?page=3&pageSize=20", headers: { cookie } },
    { name: "API: búsqueda en catálogo", path: "/api/products?q=carga%20199", headers: { cookie } },
    { name: "Página: Mis productos (SSR + sesión)", path: "/app/productos", headers: { cookie } },
    { name: "Página: Dashboard (SSR + estadísticas)", path: "/app", headers: { cookie } },
  ];

  const connections = Number(process.env.LOAD_CONNECTIONS ?? 25);
  const duration = Number(process.env.LOAD_DURATION ?? 10);
  console.log(`\nPrueba de carga · ${connections} conexiones simultáneas · ${duration} s por escenario · ${BASE}\n`);
  console.log("| Escenario | Peticiones/s | Latencia media | p97,5 | p99 | Errores |");
  console.log("|---|---|---|---|---|---|");
  for (const scenario of scenarios) {
    const result = await autocannon({ url: `${BASE}${scenario.path}`, connections, duration, headers: scenario.headers });
    const failed = result.errors + result.timeouts + result.non2xx;
    console.log(`| ${scenario.name} | ${Math.round(result.requests.average)} | ${result.latency.average.toFixed(0)} ms | ${result.latency.p97_5} ms | ${result.latency.p99} ms | ${failed} |`);
  }
} finally {
  await admin.auth.admin.deleteUser(userId);
}
