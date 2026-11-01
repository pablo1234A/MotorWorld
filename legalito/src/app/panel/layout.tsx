import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AppNav, type NavItem } from "@/components/app/app-nav";
import { UserFooter } from "@/components/app/user-footer";
import { NotConfigured } from "@/components/app/not-configured";
import { PageLoading } from "@/components/ui/feedback";
import { getAccount, getProfile, getRoles, requireUser } from "@/lib/auth";
import { AccountSwitcher } from "@/components/app/account-switcher";
import { accountLabel } from "@/lib/accounts";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: { default: "Mi panel", template: "%s · Legalito" }, robots: { index: false, follow: false } };

const NAV: NavItem[] = [
  { href: "/panel", label: "Inicio", icon: "dashboard", exact: true },
  { href: "/panel/generador", label: "Generador", icon: "generator" },
  { href: "/panel/documentos", label: "Mis documentos", icon: "documents" },
  { href: "/panel/banner-cookies", label: "Banner de cookies", icon: "cookie" },
  { href: "/panel/datos", label: "Mis datos", icon: "account" },
  { href: "/panel/suscripcion", label: "Mi suscripción", icon: "billing" },
  { href: "/panel/ayuda", label: "Ayuda", icon: "help" },
];

/** La sesión se verifica dentro del límite de Suspense; el proxy ya redirige a quien no tiene sesión. */
async function PanelShell({ children }: { children: React.ReactNode }) {
  await connection();
  if (!isSupabaseConfigured()) return <NotConfigured />;
  const user = await requireUser();
  const [profile, roles, account] = await Promise.all([getProfile(), getRoles(), getAccount()]);
  let items: NavItem[] = account?.isAgency ? [NAV[0], { href: "/panel/clientes", label: "Clientes", icon: "clients" }, ...NAV.slice(1)] : NAV;
  if (roles.includes("admin")) items = [...items, { href: "/admin", label: "Administración", icon: "admin" }];
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <AppNav items={items} homeHref="/panel" footer={<UserFooter name={profile?.full_name} email={user.email} />} />
      <main id="contenido" className="min-w-0 flex-1">
        {account?.isAgency && (
          <AccountSwitcher
            rootId={account.root.id}
            rootLabel={`${accountLabel(account.root, "Mi agencia")} (cuenta principal)`}
            activeId={account.active.id}
            clients={account.clients.filter((c) => !c.archived_at).map((c) => ({ id: c.id, label: accountLabel(c) }))}
          />
        )}
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}

export default function PanelLayout({ children }: LayoutProps<"/panel">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-10">
          <PageLoading />
        </div>
      }
    >
      <PanelShell>{children}</PanelShell>
    </Suspense>
  );
}
