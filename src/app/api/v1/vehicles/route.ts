import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/resources";

export const GET = apiRoute(
  {
    route: "GET /v1/vehicles",
    scope: "vehicles:read",
    deprecated: { successor: "/api/v1/equipment" },
  },
  r.listVehicles,
);
export const POST = apiRoute(
  {
    route: "POST /v1/vehicles",
    scope: "vehicles:write",
    deprecated: { successor: "/api/v1/equipment" },
  },
  r.createVehicle,
);
