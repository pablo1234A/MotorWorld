import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/pci";

export const POST = apiRoute(
  { route: "POST /v1/work-orders/{id}/status", scope: "work_orders:write" },
  (c) => r.setWorkOrderStatus(c, c.params.id),
);
