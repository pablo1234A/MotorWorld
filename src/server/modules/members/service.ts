import "server-only";

import { sql } from "kysely";

import { isOperatorPermission, type OperatorPermission, type Role } from "@/lib/permissions";
import type { InviteInput, UpdateMemberInput } from "@/lib/validation/auth";
import type { Membership } from "@/server/auth/context";
import { type AuthContext, withRls, withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import { enforceRateLimits, RATE_LIMITS } from "@/server/security/rate-limit";
import { generateToken, hashToken, isWellFormedToken } from "@/server/security/tokens";

/**
 * Gestión de usuarios del taller. Toda operación de administración comprueba
 * el rol aquí y, además, RLS + triggers en la base de datos (propietario
 * protegido, límite de usuarios del plan, sucursales de la misma organización).
 */

export interface MemberCtx {
  auth: AuthContext;
  membership: Pick<Membership, "organizationId" | "role" | "memberId">;
}

export interface MemberRow {
  memberId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isOwner: boolean;
  permissions: OperatorPermission[];
  branchScope: "all" | "selected";
  branchIds: string[];
  status: "active" | "suspended";
  createdAt: Date;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: Role;
  permissions: OperatorPermission[];
  branchScope: "all" | "selected";
  branchIds: string[];
  expiresAt: Date;
  expired: boolean;
  createdAt: Date;
}

export interface BranchOption {
  id: string;
  name: string;
  isPrimary: boolean;
}

function requireAdminCtx(ctx: MemberCtx): void {
  if (ctx.membership.role !== "admin") throw new DomainError("permission_denied");
}

function invitationUrl(token: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return new URL(`/invitacion/${token}`, base).toString();
}

export async function listBranches(ctx: MemberCtx): Promise<BranchOption[]> {
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

export async function listMembers(ctx: MemberCtx): Promise<{ members: MemberRow[]; invitations: InvitationRow[] }> {
  requireAdminCtx(ctx);
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const members = await tx
      .selectFrom("organization_members as m")
      .innerJoin("profiles as p", "p.id", "m.user_id")
      .select([
        "m.id as memberId",
        "m.user_id as userId",
        "p.first_name as firstName",
        "p.last_name as lastName",
        "p.email",
        "m.role",
        "m.is_owner as isOwner",
        "m.permissions",
        "m.branch_scope as branchScope",
        "m.status",
        "m.created_at as createdAt",
        sql<string[]>`coalesce((select array_agg(mb.branch_id) from member_branches mb where mb.member_id = m.id), '{}')`.as(
          "branchIds",
        ),
      ])
      .where("m.organization_id", "=", orgId)
      .orderBy("m.is_owner", "desc")
      .orderBy("m.created_at")
      .execute();

    const invitations = await tx
      .selectFrom("invitations")
      .select([
        "id",
        "email",
        "role",
        "permissions",
        "branch_scope as branchScope",
        "branch_ids as branchIds",
        "expires_at as expiresAt",
        "created_at as createdAt",
        sql<boolean>`expires_at <= now()`.as("expired"),
      ])
      .where("organization_id", "=", orgId)
      .where("accepted_at", "is", null)
      .where("revoked_at", "is", null)
      .orderBy("created_at", "desc")
      .execute();

    return {
      members: members.map((m) => ({
        ...m,
        email: String(m.email),
        role: m.role as Role,
        permissions: m.permissions.filter(isOperatorPermission),
        branchScope: m.branchScope as MemberRow["branchScope"],
        status: m.status as MemberRow["status"],
      })),
      invitations: invitations.map((i) => ({
        ...i,
        email: String(i.email),
        role: i.role as Role,
        permissions: i.permissions.filter(isOperatorPermission),
        branchScope: i.branchScope as InvitationRow["branchScope"],
      })),
    };
  });
}

/**
 * Crea una invitación y devuelve el enlace (el token solo existe en ese
 * enlace; en la base de datos se guarda su hash).
 */
export async function createInvitation(ctx: MemberCtx, input: InviteInput): Promise<{ id: string; url: string }> {
  requireAdminCtx(ctx);
  const orgId = ctx.membership.organizationId;
  await enforceRateLimits([[`invite:org:${orgId}`, RATE_LIMITS.invitationsPerOrg]]);

  const token = generateToken();
  const id = await withRls(ctx.auth, async (tx) => {
    const existing = await tx
      .selectFrom("organization_members as m")
      .innerJoin("profiles as p", "p.id", "m.user_id")
      .select("m.id")
      .where("m.organization_id", "=", orgId)
      .where("p.email", "=", input.email)
      .executeTakeFirst();
    if (existing) throw new DomainError("conflict", "organization_members_unique");

    const row = await tx
      .insertInto("invitations")
      .values({
        organization_id: orgId,
        email: input.email,
        role: input.role,
        permissions: input.permissions,
        branch_scope: input.branchScope,
        branch_ids: input.branchIds,
        token_hash: hashToken(token),
        invited_by: ctx.auth.userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  });
  return { id, url: invitationUrl(token) };
}

export async function revokeInvitation(ctx: MemberCtx, invitationId: string): Promise<void> {
  requireAdminCtx(ctx);
  const result = await withRls(ctx.auth, (tx) =>
    tx
      .updateTable("invitations")
      .set({ revoked_at: new Date() })
      .where("id", "=", invitationId)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("accepted_at", "is", null)
      .where("revoked_at", "is", null)
      .executeTakeFirst(),
  );
  if (Number(result.numUpdatedRows) === 0) throw new DomainError("not_found");
}

/** Anula la invitación y crea otra igual con un enlace nuevo (el anterior deja de valer). */
export async function renewInvitation(ctx: MemberCtx, invitationId: string): Promise<{ id: string; url: string; role: Role }> {
  requireAdminCtx(ctx);
  const inv = await withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("invitations")
      .select(["email", "role", "permissions", "branch_scope", "branch_ids"])
      .where("id", "=", invitationId)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("accepted_at", "is", null)
      .where("revoked_at", "is", null)
      .executeTakeFirst(),
  );
  if (!inv) throw new DomainError("not_found");
  await revokeInvitation(ctx, invitationId);
  const created = await createInvitation(ctx, {
    email: String(inv.email),
    role: inv.role as Role,
    permissions: inv.permissions.filter(isOperatorPermission),
    branchScope: inv.branch_scope as "all" | "selected",
    branchIds: inv.branch_ids,
  });
  return { ...created, role: inv.role as Role };
}

export async function updateMember(ctx: MemberCtx, input: UpdateMemberInput): Promise<void> {
  requireAdminCtx(ctx);
  const orgId = ctx.membership.organizationId;
  await withRls(ctx.auth, async (tx) => {
    const result = await tx
      .updateTable("organization_members")
      .set({ role: input.role, permissions: input.permissions, branch_scope: input.branchScope })
      .where("id", "=", input.memberId)
      .where("organization_id", "=", orgId)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) throw new DomainError("not_found");

    await tx.deleteFrom("member_branches").where("member_id", "=", input.memberId).execute();
    if (input.branchScope === "selected") {
      await tx
        .insertInto("member_branches")
        .values(input.branchIds.map((branchId) => ({ member_id: input.memberId, organization_id: orgId, branch_id: branchId })))
        .execute();
    }
  });
}

export async function setMemberStatus(ctx: MemberCtx, memberId: string, status: "active" | "suspended"): Promise<void> {
  requireAdminCtx(ctx);
  if (memberId === ctx.membership.memberId) throw new DomainError("permission_denied", "self");
  const result = await withRls(ctx.auth, (tx) =>
    tx
      .updateTable("organization_members")
      .set({ status })
      .where("id", "=", memberId)
      .where("organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirst(),
  );
  if (Number(result.numUpdatedRows) === 0) throw new DomainError("not_found");
}

export async function removeMember(ctx: MemberCtx, memberId: string): Promise<void> {
  requireAdminCtx(ctx);
  if (memberId === ctx.membership.memberId) throw new DomainError("permission_denied", "self");
  const result = await withRls(ctx.auth, (tx) =>
    tx
      .deleteFrom("organization_members")
      .where("id", "=", memberId)
      .where("organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirst(),
  );
  if (Number(result.numDeletedRows) === 0) throw new DomainError("not_found");
}

// --------------------------------------------------------------- invitados
export interface InvitationPreview {
  organizationName: string;
  role: Role;
  emailMasked: string;
  state: "pending" | "expired" | "revoked" | "accepted";
}

export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  if (!isWellFormedToken(token)) return null;
  const row = await withSystem(async (tx) => {
    const { rows } = await sql<{ organization_name: string; role: string; email_masked: string; state: string }>`
      select * from app.invitation_preview(${hashToken(token)})
    `.execute(tx);
    return rows[0];
  });
  if (!row) return null;
  return {
    organizationName: row.organization_name,
    role: row.role as Role,
    emailMasked: row.email_masked,
    state: row.state as InvitationPreview["state"],
  };
}

/** Acepta la invitación como el usuario autenticado. Devuelve la organización. */
export async function acceptInvitation(auth: AuthContext, token: string): Promise<string> {
  if (!isWellFormedToken(token)) throw new DomainError("invitation_invalid", "not_found");
  return withRls(auth, async (tx) => {
    const { rows } = await sql<{ org: string }>`select app.accept_invitation(${hashToken(token)}) as org`.execute(tx);
    return rows[0].org;
  });
}
