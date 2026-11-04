import type { ReactNode } from "react";
import { Suspense } from "react";

import { AppHeader } from "@/components/app/app-header";
import { PageLoading, Skeleton } from "@/components/ui/feedback";
import { requireOrgPage } from "@/server/auth/guards";

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<Skeleton className="h-14 w-full rounded-none" />}>
        <Header />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </main>
    </div>
  );
}

async function Header() {
  const ctx = await requireOrgPage("/app");
  return <AppHeader ctx={ctx} />;
}
