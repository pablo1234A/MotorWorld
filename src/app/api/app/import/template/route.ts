import { type NextRequest, NextResponse } from "next/server";

import { getOrgContext } from "@/server/auth/context";
import { CSV_MIME, templateCsv, templateXlsx, XLSX_MIME } from "@/server/modules/imports/files";

/** Plantilla de importación (.xlsx por defecto, ?formato=csv). Requiere sesión. */
export async function GET(request: NextRequest) {
  if (!(await getOrgContext())) return NextResponse.json({ error: { code: "unauthenticated" } }, { status: 401 });
  const csv = request.nextUrl.searchParams.get("formato") === "csv";
  const body = csv ? templateCsv() : await templateXlsx();
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": csv ? CSV_MIME : XLSX_MIME,
      "Content-Disposition": `attachment; filename="plantilla-revisaya.${csv ? "csv" : "xlsx"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
