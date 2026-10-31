import { prisma } from "@/server/db";
import { redis } from "@/server/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = { db: "error", redis: "error" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    /* noop */
  }
  try {
    checks.redis = (await redis().ping()) === "PONG" ? "ok" : "error";
  } catch {
    /* noop */
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  return Response.json({ status: ok ? "ok" : "degraded", checks }, { status: ok ? 200 : 503 });
}
