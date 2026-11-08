import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/pci";

export const GET = apiRoute(
  { route: "GET /v1/installations", scope: "installations:read" },
  r.listInstallations,
);
export const POST = apiRoute(
  { route: "POST /v1/installations", scope: "installations:write" },
  r.createInstallation,
);
