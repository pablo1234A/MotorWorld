import { tenantRoute } from "@/server/http/tenant";
import { requireFeature } from "@/server/modules/billing/entitlements";
import { exportJobsCsvRows } from "@/server/modules/stats";
import { toCsv } from "@/lib/csv";

export const GET = tenantRoute(async (_req, { business }) => {
  await requireFeature(business.id, "fullStats", "La exportación de estadísticas");
  return new Response(toCsv(await exportJobsCsvRows(business.id)), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="envios-resenalo.csv"', "cache-control": "no-store" },
  });
});
