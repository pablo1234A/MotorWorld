import { NextResponse } from "next/server";

import { can, getOrgContext } from "@/server/auth/context";
import { logger } from "@/server/logger";
import { quotePdf } from "@/server/modules/quotes/issue";

/** PDF de un presupuesto (con sesión; RLS limita a los presupuestos de la empresa). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthenticated" } }, { status: 401 });
  if (!can(ctx, "quotes.manage")) return NextResponse.json({ error: { code: "permission_denied" } }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  try {
    const pdf = await quotePdf(ctx, id);
    if (!pdf) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return new NextResponse(new Uint8Array(pdf.body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logger.error("quote_pdf_failed", { error: err });
    return NextResponse.json({ error: { code: "internal_error" } }, { status: 500 });
  }
}
