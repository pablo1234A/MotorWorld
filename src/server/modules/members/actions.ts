"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { inviteSchema, updateMemberSchema } from "@/lib/validation/auth";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { ACTIVE_ORG_COOKIE, activeOrgCookieOptions } from "@/server/auth/context";
import { assertAdmin, requireOrg, requireUser } from "@/server/auth/guards";
import { clientIp } from "@/server/http/request";
import { enforceRateLimits, RATE_LIMITS } from "@/server/security/rate-limit";

import * as members from "./service";

const idSchema = z.object({ id: z.uuid() });

export async function inviteMemberAction(
  _prev: ActionState<{ url: string; email: string }>,
  formData: FormData,
): Promise<ActionState<{ url: string; email: string }>> {
  return runAction(
    "member.invite",
    async () => {
      const ctx = await requireOrg();
      assertAdmin(ctx);
      const input = parseForm(inviteSchema, formData);
      const { url } = await members.createInvitation(ctx, input);
      refresh();
      return { status: "success", message: "Invitación creada.", data: { url, email: input.email } };
    },
    formData,
  );
}

export async function renewInvitationAction(
  _prev: ActionState<{ url: string; email: string }>,
  formData: FormData,
): Promise<ActionState<{ url: string; email: string }>> {
  return runAction("member.invitation_renew", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const { id } = parseForm(idSchema, formData);
    const email = z.string().parse(formData.get("email"));
    const { url } = await members.renewInvitation(ctx, id);
    refresh();
    return { status: "success", message: "Nuevo enlace generado. El anterior ya no sirve.", data: { url, email } };
  });
}

export async function revokeInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("member.invitation_revoke", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const { id } = parseForm(idSchema, formData);
    await members.revokeInvitation(ctx, id);
    refresh();
    return { status: "success", message: "Invitación anulada." };
  });
}

export async function updateMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("member.update", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const input = parseForm(updateMemberSchema, formData);
    await members.updateMember(ctx, input);
    refresh();
    return { status: "success", message: "Permisos actualizados." };
  });
}

export async function setMemberStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("member.status", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const { id, status } = parseForm(idSchema.extend({ status: z.enum(["active", "suspended"]) }), formData);
    await members.setMemberStatus(ctx, id, status);
    refresh();
    return { status: "success", message: status === "active" ? "Usuario reactivado." : "Usuario suspendido." };
  });
}

export async function removeMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("member.remove", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const { id } = parseForm(idSchema, formData);
    await members.removeMember(ctx, id);
    refresh();
    return { status: "success", message: "Usuario eliminado del taller." };
  });
}

export async function acceptInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("member.invitation_accept", async () => {
    const user = await requireUser();
    const ip = await clientIp();
    await enforceRateLimits([[`invite-accept:ip:${ip}`, RATE_LIMITS.invitationAcceptPerIp]]);
    const token = z.string().max(100).parse(formData.get("token"));
    const orgId = await members.acceptInvitation({ userId: user.id }, token);
    (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, activeOrgCookieOptions);
    redirect("/app");
  });
}
