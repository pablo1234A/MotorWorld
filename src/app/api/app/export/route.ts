import { NextResponse } from "next/server";

import { todayIn } from "@/lib/dates";
import { getOrgContext, isAdmin } from "@/server/auth/context";
import { logger } from "@/server/logger";
import { XLSX_MIME } from "@/server/modules/imports/files";
import { exportWorkshop } from "@/server/modules/privacy/service";

/** Todos los datos de la empresa en Excel. Solo administradores; también en solo lectura. */
export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthenticated" } }, { status: 401 });
  if (!isAdmin(ctx)) return NextResponse.json({ error: { code: "permission_denied" } }, { status: 403 });
  try {
    const file = await exportWorkshop(ctx);
    return new NextResponse(new Uint8Array(file), {
      headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="revisaya-${ctx.membership.organizationSlug}-${todayIn()}.xlsx"`, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    logger.error("workshop_export_failed", { error: err });
    return NextResponse.json({ error: { code: "internal_error" } }, { status: 500 });
  }
}
