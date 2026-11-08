import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/pci";

export const GET = apiRoute(
  { route: "GET /v1/equipment/{id}", scope: "equipment:read" },
  (c) => r.getEquipment(c, c.params.id),
);
export const PATCH = apiRoute(
  { route: "PATCH /v1/equipment/{id}", scope: "equipment:write" },
  (c) => r.updateEquipment(c, c.params.id),
);
