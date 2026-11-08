import "server-only";

import { sql } from "kysely";
import { cookies } from "next/headers";
import { cache } from "react";

import { isOperatorPermission, type OperatorPermission, type Role } from "@/lib/permissions";
import { PLAN_CODES, type PlanCode } from "@/lib/plans";
import { type AuthContext, withRls } from "@/server/db/client";

import { type AuthUser, getAuthUser } from "./session";

export const ACTIVE_ORG_COOKIE = "ry_org";

export interface Membership {
  memberId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  /** Logo del taller (ruta en el almacenamiento), para el panel. */
  logoPath: string | null;
  role: Role;
  isOwner: boolean;
  permissions: OperatorPermission[];
  branchScope: "all" | "selected";
}

export interface SubscriptionState {
  planCode: PlanCode | null;
  status: string | null;
  /** Acceso completo (trialing, active o impago dentro de la gracia). */
  active: boolean;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface OrgContext {
  user: AuthUser;
  auth: AuthContext;
  membership: Membership;
  memberships: Membership[];
  subscription: SubscriptionState;
}

/** Todas las membresías activas del usuario (RLS: solo ve las suyas). */
export async function listMemberships(user: AuthUser): Promise<Membership[]> {
  const rows = await withRls({ userId: user.id }, (tx) =>
    tx
      .selectFrom("organization_members as m")
      .innerJoin("organizations as o", "o.id", "m.organization_id")
      .select([
        "m.id as memberId",
        "m.organization_id as organizationId",
        "o.trade_name as organizationName",
        "o.slug as organizationSlug",
        "o.logo_path as logoPath",
        "m.role",
        "m.is_owner as isOwner",
        "m.permissions",
        "m.branch_scope as branchScope",
      ])
      .where("m.user_id", "=", user.id)
      .where("m.status", "=", "active")
      .orderBy("m.created_at")
      .execute(),
  );
  return rows.map((r) => ({
    ...r,
    role: r.role as Role,
    branchScope: r.branchScope as Membership["branchScope"],
    permissions: r.permissions.filter(isOperatorPermission),
  }));
}

export async function loadSubscription(user: Pick<AuthUser, "id">, organizationId: string): Promise<SubscriptionState> {
  const row = await withRls({ userId: user.id }, (tx) =>
    tx
      .selectFrom("subscriptions as s")
      .select([
        "s.plan_code",
        "s.status",
        "s.trial_end",
        "s.current_period_end",
        "s.cancel_at_period_end",
        sql<boolean>`app.subscription_is_active(s.status, s.past_due_since)`.as("active"),
      ])
      .where("s.organization_id", "=", organizationId)
      .executeTakeFirst(),
  );
  const planCode = row && (PLAN_CODES as readonly string[]).includes(row.plan_code) ? (row.plan_code as PlanCode) : null;
  return {
    planCode,
    status: row?.status ?? null,
    active: row?.active === true,
    trialEnd: row?.trial_end ?? null,
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
  };
}

/**
 * Contexto de la organización activa. La organización elegida en la cookie
 * solo se usa si el usuario es miembro activo de ella (comprobado contra la
 * base de datos): manipular la cookie no da acceso a nada.
 * Memorizado por petición.
 */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  const memberships = await listMemberships(user);
  if (memberships.length === 0) return null;

  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const membership = memberships.find((m) => m.organizationId === preferred) ?? memberships[0];
  const subscription = await loadSubscription(user, membership.organizationId);
  return { user, auth: { userId: user.id }, membership, memberships, subscription };
});

export function isAdmin(ctx: OrgContext): boolean {
  return ctx.membership.role === "admin";
}

/** ¿Tiene el permiso? (Comprobación de servidor; RLS lo vuelve a comprobar.) */
export function can(ctx: OrgContext, permission: OperatorPermission): boolean {
  return isAdmin(ctx) || ctx.membership.permissions.includes(permission);
}

export const activeOrgCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};
