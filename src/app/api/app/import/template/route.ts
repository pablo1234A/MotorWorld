import { type NextRequest, NextResponse } from "next/server";

import { getOrgContext } from "@/server/auth/context";
import { PCI_IMPORT_KINDS, PCI_IMPORT_LABELS, type PciImportKind } from "@/lib/imports/pci";
import { CSV_MIME, templateCsv, templateXlsx, XLSX_MIME } from "@/server/modules/imports/files";
import { pciTemplateCsv, pciTemplateXlsx } from "@/server/modules/imports/pci";

/**
 * Plantilla de importación (.xlsx por defecto, ?formato=csv). Requiere sesión.
 * ?tipo=clientes|instalaciones|equipos: plantillas PCI; sin tipo, la de vehículos (etapa anterior).
 */
export async function GET(request: NextRequest) {
  if (!(await getOrgContext())) return NextResponse.json({ error: { code: "unauthenticated" } }, { status: 401 });
  const csv = request.nextUrl.searchParams.get("formato") === "csv";
  const tipo = request.nextUrl.searchParams.get("tipo");
  const kind = PCI_IMPORT_KINDS.find((k) => PCI_IMPORT_LABELS[k].slug === tipo) as PciImportKind | undefined;
  const body = kind ? (csv ? pciTemplateCsv(kind) : await pciTemplateXlsx(kind)) : csv ? templateCsv() : await templateXlsx();
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": csv ? CSV_MIME : XLSX_MIME,
      "Content-Disposition": `attachment; filename="plantilla-${kind ? PCI_IMPORT_LABELS[kind].slug : "vehiculos"}-revisaya.${csv ? "csv" : "xlsx"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
