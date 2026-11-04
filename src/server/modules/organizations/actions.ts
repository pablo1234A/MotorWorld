"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createOrganizationSchema } from "@/lib/validation/auth";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { ACTIVE_ORG_COOKIE, activeOrgCookieOptions } from "@/server/auth/context";
import { requireUser } from "@/server/auth/guards";
import { DomainError } from "@/server/db/errors";

import { createOrganization, isActiveMember } from "./service";

export async function createOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "organization.create",
    async () => {
      const user = await requireUser();
      const input = parseForm(createOrganizationSchema, formData);
      const orgId = await createOrganization({ userId: user.id }, {
        tradeName: input.tradeName,
        slug: input.slug || undefined,
        timezone: input.timezone,
      });
      (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, activeOrgCookieOptions);
      redirect("/app");
    },
    formData,
  );
}

/** Cambia el taller activo. Solo a organizaciones de las que el usuario es miembro activo. */
export async function switchOrganizationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const orgId = z.uuid().parse(formData.get("organizationId"));
  if (!(await isActiveMember({ userId: user.id }, orgId))) throw new DomainError("permission_denied");
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, activeOrgCookieOptions);
  redirect("/app");
}
