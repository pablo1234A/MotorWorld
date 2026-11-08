import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/pci";

export const GET = apiRoute(
  { route: "GET /v1/work-orders", scope: "work_orders:read" },
  r.listWorkOrders,
);
export const POST = apiRoute(
  { route: "POST /v1/work-orders", scope: "work_orders:write" },
  r.createWorkOrder,
);
