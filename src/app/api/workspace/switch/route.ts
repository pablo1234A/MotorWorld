import { cookies } from "next/headers";
import { WORKSPACE_COOKIE, requireApiSession } from "@/server/auth/session";
import { notFound } from "@/server/http/errors";
import { ok, parseBody, route } from "@/server/http/handler";
import { switchWorkspaceSchema } from "@/validation/schemas";

/** Cambia el espacio de trabajo activo. Solo entre espacios de los que el usuario es miembro. */
export const POST = route(async (request) => {
  const context = await requireApiSession();
  const { workspaceId } = await parseBody(request, switchWorkspaceSchema);
  if (!context.workspaces.some((workspace) => workspace.id === workspaceId)) throw notFound("El espacio de trabajo");
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return ok({ workspaceId });
});
