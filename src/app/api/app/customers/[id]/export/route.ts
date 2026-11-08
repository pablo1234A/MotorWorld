import { NextResponse } from "next/server";

import { getOrgContext, isAdmin } from "@/server/auth/context";
import { DomainError, mapDatabaseError } from "@/server/db/errors";
import { logger } from "@/server/logger";
import { exportCustomer } from "@/server/modules/privacy/service";

/** Datos de un cliente en JSON (derecho de acceso y portabilidad). Solo administradores. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthenticated" } }, { status: 401 });
  if (!isAdmin(ctx)) return NextResponse.json({ error: { code: "permission_denied" } }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  try {
    const data = await exportCustomer(ctx, id);
    if (!data) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="cliente-${id.slice(0, 8)}.json"`, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const e = err instanceof DomainError ? err : mapDatabaseError(err);
    if (e.code === "internal_error") logger.error("customer_export_failed", { error: err });
    return NextResponse.json({ error: { code: e.code } }, { status: e.status });
  }
}
