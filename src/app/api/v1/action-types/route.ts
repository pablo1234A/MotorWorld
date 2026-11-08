import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/pci";

export const GET = apiRoute(
  { route: "GET /v1/action-types", scope: "equipment:read" },
  r.listActionTypes,
);
