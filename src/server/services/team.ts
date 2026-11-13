import "server-only";
import { appUrl } from "@/lib/config/env";
import type { SessionContext, WorkspaceRole } from "@/server/auth/session";
import { ApiError, notFound } from "@/server/http/errors";
import { fromDbError } from "@/server/http/handler";
import { getUsage } from "./usage";

const REASONS: Record<string, [ApiError["code"], string]> = {
  owner_required: ["forbidden", "Solo el propietario del espacio puede gestionar administradores."],
  already_member: ["conflict", "Esa persona ya forma parte del equipo."],
  member_limit: ["limit_reached", "Has alcanzado el número de miembros de tu plan."],
  not_found: ["not_found", "La invitación o el miembro no existe."],
  wrong_account: ["forbidden", "Esta invitación se envió a otro correo. Inicia sesión con la cuenta invitada."],
  expired: ["conflict", "La invitación ha caducado. Pide que te envíen una nueva."],
  owner_cannot_leave: ["conflict", "El propietario no puede abandonar su espacio de trabajo."],
};

function check(data: unknown): Record<string, unknown> {
  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok !== true) {
    const [code, message] = REASONS[String(result.reason)] ?? ["bad_request", "No se pudo completar la operación."];
    throw new ApiError(code, message, { reason: result.reason });
  }
  return result;
}

function assertManager(context: SessionContext) {
  if (context.role !== "owner" && context.role !== "admin") throw new ApiError("forbidden", "Solo el propietario o un administrador pueden gestionar el equipo.");
}

export const invitationLink = (token: string) => appUrl(`/invitacion/${token}`);

export type TeamMember = { userId: string; name: string; email: string; role: WorkspaceRole; joinedAt: string; isYou: boolean };
export type TeamInvitation = { id: string; email: string; role: string; link: string; expiresAt: string };

export async function getTeam(context: SessionContext) {
  const { supabase, workspace, user } = context;
  const canManage = context.role === "owner" || context.role === "admin";
  const [members, invitations, usage] = await Promise.all([
    supabase.from("workspace_members").select("user_id, role, created_at, profiles(full_name, email)").eq("workspace_id", workspace.id).order("created_at"),
    canManage ? supabase.from("workspace_invitations").select("id, email, role, token, expires_at").eq("workspace_id", workspace.id).gt("expires_at", new Date().toISOString()).order("created_at") : Promise.resolve({ data: [], error: null }),
    getUsage(supabase, workspace.id),
  ]);
  if (members.error) throw fromDbError(members.error);
  return {
    canManage,
    isOwner: context.role === "owner",
    maxMembers: usage.features.maxMembers,
    planName: usage.planName,
    members: members.data.map((row): TeamMember => ({ userId: row.user_id, name: row.profiles?.full_name ?? "", email: row.profiles?.email ?? "", role: row.role as WorkspaceRole, joinedAt: row.created_at, isYou: row.user_id === user.id })),
    invitations: (invitations.data ?? []).map((row): TeamInvitation => ({ id: row.id, email: row.email, role: row.role, link: invitationLink(row.token), expiresAt: row.expires_at })),
  };
}

export async function inviteMember(context: SessionContext, email: string, role: "admin" | "editor" | "viewer"): Promise<TeamInvitation> {
  assertManager(context);
  const { data, error } = await context.supabase.rpc("invite_member", { p_workspace: context.workspace.id, p_email: email, p_role: role });
  if (error) throw fromDbError(error, "No se pudo crear la invitación.");
  const result = check(data);
  return { id: String(result.id), email: String(result.email), role: String(result.role), link: invitationLink(String(result.token)), expiresAt: String(result.expires_at) };
}

export async function revokeInvitation(context: SessionContext, id: string) {
  assertManager(context);
  const { data, error } = await context.supabase.rpc("revoke_invitation", { p_invitation: id });
  if (error) throw fromDbError(error);
  if (data !== true) throw notFound("La invitación");
}

export async function setMemberRole(context: SessionContext, userId: string, role: "admin" | "editor" | "viewer") {
  assertManager(context);
  const { data, error } = await context.supabase.rpc("set_member_role", { p_workspace: context.workspace.id, p_user: userId, p_role: role });
  if (error) throw fromDbError(error);
  check(data);
}

export async function removeMember(context: SessionContext, userId: string) {
  const { data, error } = await context.supabase.rpc("remove_member", { p_workspace: context.workspace.id, p_user: userId });
  if (error) throw fromDbError(error);
  check(data);
}

export type PendingInvitation = { token: string; workspaceName: string; role: string; invitedBy: string | null };

export async function listMyInvitations(context: SessionContext): Promise<PendingInvitation[]> {
  const { data, error } = await context.supabase.rpc("my_invitations");
  if (error) return [];
  return (data ?? []).map((row) => ({ token: row.token, workspaceName: row.workspace_name, role: row.role, invitedBy: row.invited_by_name }));
}

export async function acceptInvitation(context: SessionContext, token: string): Promise<string> {
  const { data, error } = await context.supabase.rpc("accept_invitation", { p_token: token });
  if (error) throw fromDbError(error);
  return String(check(data).workspace_id);
}

export async function declineInvitation(context: SessionContext, token: string) {
  const { error } = await context.supabase.rpc("decline_invitation", { p_token: token });
  if (error) throw fromDbError(error);
}
