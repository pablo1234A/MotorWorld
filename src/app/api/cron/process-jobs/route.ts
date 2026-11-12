import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import { getAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { processJobBatch } from "@/server/services/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return false;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * Tarea programada: avanza los trabajos masivos pendientes aunque el usuario haya
 * cerrado el navegador. Protegida con CRON_SECRET (Vercel Cron lo envía como Bearer).
 */
export async function GET(request: Request) {
  if (!authorized(request) || !hasAdminClient()) return NextResponse.json({ error: { code: "not_found", message: "No encontrado." } }, { status: 404 });
  const admin = getAdminClient();
  const deadline = Date.now() + 45_000;
  const { data: jobs } = await admin.from("generation_jobs").select("id").in("status", ["pending", "processing"]).order("created_at").limit(5);
  let batches = 0;
  for (const job of jobs ?? []) {
    while (Date.now() < deadline) {
      try {
        const updated = await processJobBatch(admin, job.id);
        batches += 1;
        if (!["pending", "processing"].includes(updated.status)) break;
      } catch (error) {
        logger.error("cron.job_batch_failed", { jobId: job.id, error });
        break;
      }
    }
  }
  return NextResponse.json({ jobs: jobs?.length ?? 0, batches });
}
