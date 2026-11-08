import type { ReactNode } from "react";
import { Suspense } from "react";

import { AppHeader, AppSidebar } from "@/components/app/app-header";
import { PageLoading, Skeleton } from "@/components/ui/feedback";
import { requireOrgPage } from "@/server/auth/guards";

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<Skeleton className="h-12 w-full rounded-none" />}>
        <Header />
      </Suspense>
      <div className="flex flex-1">
        <Suspense fallback={null}>
          <Sidebar />
        </Suspense>
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 sm:py-8">
          <Suspense fallback={<PageLoading />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}

async function Header() {
  const ctx = await requireOrgPage("/app");
  return <AppHeader ctx={ctx} />;
}

async function Sidebar() {
  const ctx = await requireOrgPage("/app");
  return <AppSidebar ctx={ctx} />;
}
