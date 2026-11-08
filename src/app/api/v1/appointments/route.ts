import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/resources";

export const GET = apiRoute({ route: "GET /v1/appointments", scope: "appointments:read" }, r.listAppointments);
export const POST = apiRoute({ route: "POST /v1/appointments", scope: "appointments:write" }, r.createAppointment);
