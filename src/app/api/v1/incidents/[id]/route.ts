import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/pci";

export const GET = apiRoute(
  { route: "GET /v1/incidents/{id}", scope: "incidents:read" },
  (c) => r.getIncident(c, c.params.id),
);
export const PATCH = apiRoute(
  { route: "PATCH /v1/incidents/{id}", scope: "incidents:write" },
  (c) => r.updateIncident(c, c.params.id),
);
