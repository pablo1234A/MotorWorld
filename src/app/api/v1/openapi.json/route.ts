import { NextResponse } from "next/server";

import { openApiDocument } from "@/server/api/openapi";

/** Descripción OpenAPI 3.1 de la API (pública: no contiene datos). */
export async function GET(request: Request) {
  return NextResponse.json(openApiDocument(process.env.APP_URL ?? new URL(request.url).origin), { headers: { "Cache-Control": "public, max-age=3600" } });
}
