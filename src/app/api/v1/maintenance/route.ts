import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/resources";

export const GET = apiRoute(
  {
    route: "GET /v1/maintenance",
    scope: "maintenance:read",
    deprecated: { successor: "/api/v1/actions" },
  },
  r.listMaintenance,
);
export const POST = apiRoute(
  {
    route: "POST /v1/maintenance",
    scope: "maintenance:write",
    deprecated: { successor: "/api/v1/actions" },
  },
  r.createMaintenance,
);
