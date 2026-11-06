import { NextResponse } from "next/server";

import { unsubscribe } from "@/server/modules/unsubscribe/service";

/**
 * Baja "one-click" (RFC 8058): los clientes de correo (Gmail, Outlook…) hacen
 * POST a la URL de la cabecera List-Unsubscribe. Sin sesión: la autenticidad
 * la da la firma del token. Idempotente.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await unsubscribe(token.slice(0, 200));
  if (!result) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  return NextResponse.json({ ok: true });
}
