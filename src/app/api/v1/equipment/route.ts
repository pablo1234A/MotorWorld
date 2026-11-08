import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/pci";

export const GET = apiRoute(
  { route: "GET /v1/equipment", scope: "equipment:read" },
  r.listEquipment,
);
export const POST = apiRoute(
  { route: "POST /v1/equipment", scope: "equipment:write" },
  r.createEquipment,
);
