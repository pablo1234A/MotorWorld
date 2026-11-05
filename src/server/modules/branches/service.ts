import "server-only";

import type { Membership } from "@/server/auth/context";
import { type AuthContext, withRls } from "@/server/db/client";

export interface ServiceCtx {
  auth: AuthContext;
  membership: Pick<Membership, "organizationId" | "role" | "memberId" | "permissions">;
}

export interface BranchOption {
  id: string;
  name: string;
  isPrimary: boolean;
}

/** Sucursales activas a las que el usuario tiene acceso (RLS aplica el alcance). */
export async function listAccessibleBranches(ctx: Pick<ServiceCtx, "auth" | "membership">): Promise<BranchOption[]> {
  return withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("branches")
      .select(["id", "name", "is_primary as isPrimary"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("status", "=", "active")
      .orderBy("is_primary", "desc")
      .orderBy("name")
      .execute(),
  );
}
