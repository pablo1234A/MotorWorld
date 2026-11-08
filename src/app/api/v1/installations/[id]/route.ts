import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/pci";

export const GET = apiRoute(
  { route: "GET /v1/installations/{id}", scope: "installations:read" },
  (c) => r.getInstallation(c, c.params.id),
);
export const PATCH = apiRoute(
  { route: "PATCH /v1/installations/{id}", scope: "installations:write" },
  (c) => r.updateInstallation(c, c.params.id),
);
