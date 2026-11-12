import { buildCsvTemplate } from "@/domain/csv/import";

/** Plantilla CSV de ejemplo (pública: no contiene datos de ningún usuario). */
export function GET() {
  return new Response(buildCsvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-anunciapro.csv"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
