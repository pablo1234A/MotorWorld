import { NextResponse } from "next/server";

import { readLogo } from "@/server/modules/organizations/profile";

/**
 * Logo público de la empresa (correos, página de citas). Solo sirve el logo
 * ACTUAL de una organización activa; nada más del bucket privado.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; file: string }> }) {
  const { orgId, file } = await params;
  if (!UUID.test(orgId) || !/^logo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/.test(file)) {
    return new NextResponse(null, { status: 404 });
  }
  const logo = await readLogo(orgId, file);
  if (!logo) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(logo.body), {
    headers: {
      "Content-Type": logo.contentType,
      // El nombre cambia con cada subida: se puede cachear mucho tiempo.
      "Cache-Control": "public, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
