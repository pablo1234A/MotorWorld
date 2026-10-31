import { userRoute } from "@/server/http/tenant";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { exportAccountData } from "@/server/modules/account";
import { audit } from "@/server/modules/audit";

export const GET = userRoute(async (req, { user }) => {
  await enforceRateLimit(`export:${user.id}`, 5, 3600);
  const data = await exportAccountData(user.id);
  await audit({ action: "account.exported", userId: user.id, req });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="resenalo-datos-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});
