import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/resources";

export const GET = apiRoute(
  { route: "GET /v1/customers/{id}", scope: "customers:read" },
  (c) => r.getCustomer(c, c.params.id),
);
export const PATCH = apiRoute(
  { route: "PATCH /v1/customers/{id}", scope: "customers:write" },
  (c) => r.updateCustomer(c, c.params.id),
);
