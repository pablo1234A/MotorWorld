import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/resources";

export const GET = apiRoute({ route: "GET /v1/appointments/{id}", scope: "appointments:read" }, (c) => r.getAppointment(c, c.params.id));
export const PATCH = apiRoute({ route: "PATCH /v1/appointments/{id}", scope: "appointments:write" }, (c) => r.updateAppointment(c, c.params.id));
