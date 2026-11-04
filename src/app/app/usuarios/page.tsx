import type { Metadata } from "next";

import { MembersManager } from "@/components/members/members-manager";
import { Alert } from "@/components/ui/feedback";
import { PLANS } from "@/lib/plans";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { listBranches, listMembers } from "@/server/modules/members/service";

export const metadata: Metadata = { title: "Usuarios · RevisaYa" };

export default async function MembersPage() {
  const ctx = await requireOrgPage("/app/usuarios");
  if (!isAdmin(ctx)) {
    return <Alert tone="error" title="Sin permiso">Solo los administradores del taller pueden gestionar usuarios.</Alert>;
  }

  const [{ members, invitations }, branches] = await Promise.all([listMembers(ctx), listBranches(ctx)]);
  const plan = ctx.subscription.planCode ? PLANS[ctx.subscription.planCode] : null;
  const pending = invitations.filter((i) => !i.expired).length;
  const used = members.filter((m) => m.status === "active").length + pending;
  const max = plan?.maxUsers ?? null;
  const canInvite = ctx.subscription.active && (max === null || used < max);
  const limitNote = !ctx.subscription.active
    ? "Necesitas un plan activo para invitar usuarios."
    : max === null
      ? `Tu plan ${plan?.name} incluye usuarios ilimitados.`
      : `Tu plan ${plan?.name} incluye ${max} ${max === 1 ? "usuario" : "usuarios"}. En uso: ${used} (contando invitaciones pendientes).`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-sm text-[var(--muted)]">Quién puede entrar en el panel de {ctx.membership.organizationName} y qué puede hacer.</p>
      </div>
      <MembersManager
        members={members}
        invitations={invitations}
        branches={branches}
        selfMemberId={ctx.membership.memberId}
        canInvite={canInvite}
        limitNote={limitNote}
      />
    </div>
  );
}
