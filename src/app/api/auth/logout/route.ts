import { destroySession } from "@/server/auth";
import { assertSameOrigin, handler, json } from "@/server/http";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  await destroySession();
  return json({ ok: true });
});
