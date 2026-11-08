import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/resources";

export const POST = apiRoute({ route: "POST /v1/vehicles/{id}/mileage", scope: "vehicles:write" }, (c) => r.recordMileage(c, c.params.id));
