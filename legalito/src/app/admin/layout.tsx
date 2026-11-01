import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AppNav, type NavItem } from "@/components/app/app-nav";
import { UserFooter } from "@/components/app/user-footer";
import { AdminSubnav } from "@/components/admin/subnav";
import { PageLoading } from "@/components/ui/feedback";
import { NotConfigured } from "@/components/app/not-configured";
import { getProfile, requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: { default: "Administración", template: "%s · Admin Legalito" }, robots: { index: false, follow: false } };

const NAV: NavItem[] = [
  { href: "/admin", label: "Administración", icon: "admin", exact: true },
  { href: "/panel", label: "Volver a mi panel", icon: "dashboard", exact: true },
];

/** Todo el contenido (incluida la navegación) se renderiza solo tras verificar el rol de administrador. */
async function AdminGate({ children }: { children: React.ReactNode }) {
  await connection();
  if (!isSupabaseConfigured()) return <NotConfigured />;
  const user = await requireAdmin();
  const profile = await getProfile();
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <AppNav items={NAV} homeHref="/admin" footer={<UserFooter name={profile?.full_name} email={user.email} />} />
      <main id="contenido" className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
          <AdminSubnav />
          {children}
        </div>
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl px-4 py-10">
          <PageLoading />
        </div>
      }
    >
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
