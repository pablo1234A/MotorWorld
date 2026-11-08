import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/pci";

// Actuaciones sobre equipos PCI (permiso de historial: maintenance).
export const GET = apiRoute(
  { route: "GET /v1/actions", scope: "maintenance:read" },
  r.listActions,
);
export const POST = apiRoute(
  { route: "POST /v1/actions", scope: "maintenance:write" },
  r.createAction,
);
