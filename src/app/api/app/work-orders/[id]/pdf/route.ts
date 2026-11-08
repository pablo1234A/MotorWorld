import { NextResponse } from "next/server";

import { getOrgContext } from "@/server/auth/context";
import { logger } from "@/server/logger";
import { workOrderPdf } from "@/server/pci/pdf";

/** Parte de trabajo en PDF (con sesión; la RLS limita a las órdenes que el usuario ve). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthenticated" } }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  try {
    const pdf = await workOrderPdf(ctx, id);
    if (!pdf) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return new NextResponse(new Uint8Array(pdf.body), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    logger.error("work_order_pdf_failed", { error: err });
    return NextResponse.json({ error: { code: "internal_error" } }, { status: 500 });
  }
}
