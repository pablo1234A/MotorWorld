import { requireApiSession } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { renameWorkspace } from "@/server/services/account";
import { workspaceSchema } from "@/validation/schemas";

export const PATCH = route(async (request) => {
  const context = await requireApiSession();
  const input = await parseBody(request, workspaceSchema);
  await renameWorkspace(context, input.name);
  return ok({ name: input.name });
});
