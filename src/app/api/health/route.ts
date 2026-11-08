import { sql } from "kysely";
import { NextResponse } from "next/server";

import { withSystem } from "@/server/db/client";
import { dynamicRequest } from "@/server/http/dynamic";
import { logger } from "@/server/logger";

/**
 * Comprobación de vida para el monitor externo (UptimeRobot, Better Stack…):
 * 200 si la aplicación responde y la base de datos contesta; 503 si no. No
 * revela configuración ni datos. El estado de los procesos programados está
 * en /api/internal/jobs/status (con CRON_SECRET).
 */
export async function GET() {
  await dynamicRequest();
  const started = Date.now();
  try {
    await withSystem((tx) => sql`select 1`.execute(tx));
    return NextResponse.json({ status: "ok", db: "ok", latency_ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("health_db_failed", { error: err });
    return NextResponse.json({ status: "error", db: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
