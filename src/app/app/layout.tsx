import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Onboarding } from "@/components/app/onboarding";
import { AppShell } from "@/components/app/shell";
import { usagePercent } from "@/domain/plans";
import { isPlatformAdmin, requireSession } from "@/server/auth/session";
import { getAvatarUrl } from "@/server/services/account";
import { getUsage } from "@/server/services/usage";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Protección en servidor: sin sesión válida se redirige al login.
  const context = await requireSession();
  const [usage, admin, avatarUrl] = await Promise.all([
    getUsage(context.supabase, context.workspace.id),
    isPlatformAdmin(context.user.id),
    getAvatarUrl(context.supabase, context.profile.avatar_url),
  ]);
  return (
    <AppShell
      user={{ name: context.profile.full_name, email: context.profile.email, avatarUrl, isAdmin: admin }}
      usage={{ planName: usage.planName, used: usage.used, limit: usage.monthlyListingLimit, percent: usagePercent(usage) }}
    >
      {children}
      {!context.profile.onboarding_completed_at ? <Onboarding name={context.profile.full_name} /> : null}
    </AppShell>
  );
}
