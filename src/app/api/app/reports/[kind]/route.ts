import { NextResponse } from "next/server";

import { addDays, todayIn } from "@/lib/dates";
import { can, getOrgContext } from "@/server/auth/context";
import { DomainError, mapDatabaseError } from "@/server/db/errors";
import { logger } from "@/server/logger";
import { CSV_MIME, toCsv } from "@/server/modules/imports/files";
import { exportRows, parseRange, REPORT_KINDS, type ReportKind, reportsAvailable } from "@/server/modules/reports/service";

/** Exportación a CSV de un informe (plan Max, permiso «Ver informes»). */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthenticated" } }, { status: 401 });
  if (!can(ctx, "reports.read")) return NextResponse.json({ error: { code: "permission_denied" } }, { status: 403 });
  if (!reportsAvailable(ctx)) return NextResponse.json({ error: { code: "feature_unavailable" } }, { status: 403 });
  const { kind } = await params;
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  const sp = new URL(request.url).searchParams;
  const range = parseRange({ desde: sp.get("desde") ?? undefined, hasta: sp.get("hasta") ?? undefined, sucursal: sp.get("sucursal") ?? undefined });
  const until = addDays(todayIn(), 30);
  try {
    const rows = await exportRows(ctx, kind as ReportKind, range, until);
    const name = kind === "revisiones-pendientes" ? `revisiones-pendientes-${todayIn()}` : `${kind}-${range.from}-a-${range.to}`;
    return new NextResponse(new Uint8Array(toCsv(rows)), {
      headers: { "Content-Type": CSV_MIME, "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const e = err instanceof DomainError ? err : mapDatabaseError(err);
    if (e.code === "internal_error") logger.error("report_export_failed", { error: err });
    return NextResponse.json({ error: { code: e.code } }, { status: e.status });
  }
}
