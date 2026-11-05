import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorMessage } from "@/lib/error-messages";
import { getOrgContext } from "@/server/auth/context";
import { DomainError } from "@/server/db/errors";
import { searchCustomerOptions } from "@/server/modules/customers/service";

/**
 * Búsqueda de clientes para selectores del panel (p. ej. nuevo propietario de
 * un vehículo). Requiere sesión; RLS limita el resultado a las sucursales del
 * usuario. GET sin efectos, sin caché compartida.
 */
const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  branchId: z.uuid().optional(),
});

export async function GET(request: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: { code: "unauthenticated", message: errorMessage("unauthenticated") } }, { status: 401 });
  }
  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
    branchId: request.nextUrl.searchParams.get("branchId") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "private, no-store" } });
  try {
    const results = await searchCustomerOptions(ctx, parsed.data.q, parsed.data.branchId);
    return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    const code = err instanceof DomainError ? err.code : "internal_error";
    return NextResponse.json({ error: { code, message: errorMessage(code) } }, { status: err instanceof DomainError ? err.status : 500 });
  }
}
