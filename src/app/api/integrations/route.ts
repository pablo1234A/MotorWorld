import { handler, json, requireUser } from "@/server/http";
import { integrationStatus } from "@/server/integrations";

export const GET = handler(async () => {
  await requireUser();
  return json({ integrations: integrationStatus() });
});
