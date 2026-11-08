import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/pci";

export const GET = apiRoute(
  { route: "GET /v1/work-orders/{id}", scope: "work_orders:read" },
  (c) => r.getWorkOrder(c, c.params.id),
);
