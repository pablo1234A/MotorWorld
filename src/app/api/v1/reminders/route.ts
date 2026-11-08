import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/resources";

export const GET = apiRoute(
  { route: "GET /v1/reminders", scope: "reminders:read" },
  r.listReminders,
);
