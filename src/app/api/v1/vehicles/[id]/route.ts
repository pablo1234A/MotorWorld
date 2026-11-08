import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/resources";

export const GET = apiRoute({ route: "GET /v1/vehicles/{id}", scope: "vehicles:read" }, (c) => r.getVehicle(c, c.params.id));
export const PATCH = apiRoute({ route: "PATCH /v1/vehicles/{id}", scope: "vehicles:write" }, (c) => r.updateVehicle(c, c.params.id));
