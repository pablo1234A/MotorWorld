import { prisma } from "@/server/db";
import { tenantRoute } from "@/server/http/tenant";
import { requireFeature } from "@/server/modules/billing/entitlements";
import { toCsv } from "@/lib/csv";

export const GET = tenantRoute(async (_req, { business }) => {
  await requireFeature(business.id, "customerTags", "La exportación de clientes");
  const rows = await prisma.customer.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });
  const csv = toCsv([
    ["nombre", "email", "telefono", "servicio", "fecha", "etiquetas", "estado_solicitud", "ultima_solicitud", "baja"],
    ...rows.map((c) => [c.name, c.email, c.phone, c.serviceName, c.completedAt?.toISOString().slice(0, 10), c.tags.join("|"), c.lastRequestStatus, c.lastRequestAt?.toISOString() ?? "", c.unsubscribedAt ? "sí" : ""]),
  ]);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="clientes.csv"', "cache-control": "no-store" } });
});
