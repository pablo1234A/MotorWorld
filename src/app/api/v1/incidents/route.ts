import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/pci";

export const GET = apiRoute(
  { route: "GET /v1/incidents", scope: "incidents:read" },
  r.listIncidents,
);
export const POST = apiRoute(
  { route: "POST /v1/incidents", scope: "incidents:write" },
  r.createIncident,
);
