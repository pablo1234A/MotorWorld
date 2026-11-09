import { type NextRequest, NextResponse } from "next/server";

import { can, getOrgContext } from "@/server/auth/context";
import { CSV_MIME, reportCsv, reportXlsx, XLSX_MIME } from "@/server/modules/imports/files";
import type { PciImportKind } from "@/lib/imports/pci";
import { pciReportCsv, pciRows } from "@/server/modules/imports/pci";
import { getBatch, reportRows } from "@/server/modules/imports/service";

/** Informe de errores y avisos de una importación (?formato=csv|xlsx). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthenticated" } }, { status: 401 });
  if (!can(ctx, "imports.run")) return NextResponse.json({ error: { code: "permission_denied" } }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  const batch = await getBatch(ctx, id);
  if (!batch) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

  if (batch.kind !== "vehicles") {
    const body = pciReportCsv(batch.kind as PciImportKind, await pciRows(ctx, id));
    return new NextResponse(new Uint8Array(body), {
      headers: { "Content-Type": CSV_MIME, "Content-Disposition": `attachment; filename="revision-importacion.csv"`, "Cache-Control": "private, no-store" },
    });
  }
  const rows = await reportRows(ctx, id);
  const xlsx = request.nextUrl.searchParams.get("formato") === "xlsx";
  const body = xlsx ? await reportXlsx(rows) : reportCsv(rows);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": xlsx ? XLSX_MIME : CSV_MIME,
      "Content-Disposition": `attachment; filename="errores-importacion.${xlsx ? "xlsx" : "csv"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
