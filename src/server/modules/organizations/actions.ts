"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createOrganizationSchema } from "@/lib/validation/auth";
import { organizationProfileSchema } from "@/lib/validation/organization";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { ACTIVE_ORG_COOKIE, activeOrgCookieOptions } from "@/server/auth/context";
import { assertAdmin, requireOrg, requireUser } from "@/server/auth/guards";
import { DomainError } from "@/server/db/errors";

import * as profile from "./profile";
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

// ------------------------------------------------------------ datos del taller

export async function updateOrganizationProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "organization.profile_update",
    async () => {
      const ctx = await requireOrg();
      assertAdmin(ctx);
      await profile.updateProfile(ctx, parseForm(organizationProfileSchema, formData));
      refresh();
      return { status: "success", message: "Datos del taller guardados." };
    },
    formData,
  );
}

export async function uploadLogoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("organization.logo_upload", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const file = formData.get("logo");
    if (!(file instanceof File)) throw new DomainError("validation_error", "logo_empty");
    await profile.uploadLogo(ctx, file);
    refresh();
    return { status: "success", message: "Logo actualizado." };
  });
}

export async function removeLogoAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction("organization.logo_remove", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    await profile.removeLogo(ctx);
    refresh();
    return { status: "success", message: "Logo eliminado." };
  });
}
