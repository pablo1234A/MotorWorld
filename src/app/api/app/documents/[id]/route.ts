import { NextResponse } from "next/server";

import { getOrgContext } from "@/server/auth/context";
import { logger } from "@/server/logger";
import { documentUrl } from "@/server/modules/documents/service";

/**
 * Descarga de un documento o foto PCI: con sesión, la RLS decide si el
 * usuario lo ve (un técnico, solo los de sus órdenes) y se redirige a una URL
 * firmada del almacenamiento privado que caduca en 60 segundos.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthenticated" } }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  try {
    const url = await documentUrl(ctx, id);
    if (!url) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (err) {
    logger.error("document_url_failed", { error: err });
    return NextResponse.json({ error: { code: "internal_error" } }, { status: 500 });
  }
}
