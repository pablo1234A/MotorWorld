import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Onboarding } from "@/components/app/onboarding";
import { AppShell } from "@/components/app/shell";
import { usagePercent } from "@/domain/plans";
import { isPlatformAdmin, requireSession } from "@/server/auth/session";
import { getAvatarUrl } from "@/server/services/account";
import { listMyInvitations } from "@/server/services/team";
import { getUsage } from "@/server/services/usage";
import { InvitationActions } from "@/components/app/team";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Protección en servidor: sin sesión válida se redirige al login.
  const context = await requireSession();
  const [usage, admin, avatarUrl, invitations] = await Promise.all([
    getUsage(context.supabase, context.workspace.id),
    isPlatformAdmin(context.user.id),
    getAvatarUrl(context.supabase, context.profile.avatar_url),
    listMyInvitations(context),
  ]);
  return (
    <AppShell
      user={{ name: context.profile.full_name, email: context.profile.email, avatarUrl, isAdmin: admin }}
      workspaces={context.workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, active: workspace.id === context.workspace.id }))}
      usage={{ planName: usage.planName, used: usage.used, limit: usage.monthlyListingLimit, percent: usagePercent(usage) }}
    >
      {invitations.map((invitation) => (
        <div key={invitation.token} className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand-soft px-4 py-3 text-sm text-brand-ink">
          <p>
            <strong>{invitation.invitedBy ?? "Alguien"}</strong> te ha invitado al espacio de trabajo <strong>«{invitation.workspaceName}»</strong>.
          </p>
          <InvitationActions token={invitation.token} workspaceName={invitation.workspaceName} compact />
        </div>
      ))}
      {children}
      {!context.profile.onboarding_completed_at ? <Onboarding name={context.profile.full_name} /> : null}
    </AppShell>
  );
}
