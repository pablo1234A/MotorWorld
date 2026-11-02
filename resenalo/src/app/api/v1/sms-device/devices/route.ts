import { tenantRoute } from "@/server/http/tenant";
import { listGatewayDevices } from "@/server/modules/sms-device";

export const GET = tenantRoute(async (_req, { business }) => Response.json({ devices: await listGatewayDevices(business.id) }));
