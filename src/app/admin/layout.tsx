import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/nav";
import { Logo } from "@/components/logo";
import { requireAdminPage } from "@/server/auth/session";

export const metadata: Metadata = { title: { default: "Administración", template: "%s · Admin AnunciaPro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Validación exclusivamente en servidor contra platform_admins. Sin permiso → 404.
  const context = await requireAdminPage();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <div className="flex items-center gap-3">
            <Logo href="/admin" size="sm" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-white">
              <ShieldCheck className="size-3.5" aria-hidden /> Administración
            </span>
          </div>
          <div className="flex items-center gap-4 text-[13px] text-muted">
            <span className="hidden sm:inline">{context.profile.email}</span>
            <Link href="/app" className="font-medium text-brand-strong hover:underline">
              Volver a la aplicación
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-5">
          <AdminNav />
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-7xl px-5 py-8">
        {children}
      </main>
    </div>
  );
}
