import { NextResponse } from "next/server";
import { parseEnv } from "@/lib/config/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Comprobación de salud para monitorización. No expone valores de configuración. */
export async function GET() {
  const env = parseEnv(process.env);
  let database = false;
  if (env.success) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("plans").select("id", { head: true, count: "exact" }).limit(1);
      database = !error;
    } catch {
      database = false;
    }
  }
  const healthy = env.success && database;
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", config: env.success, database, time: new Date().toISOString() },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
