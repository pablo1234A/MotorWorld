import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignUpForm } from "@/components/auth/auth-forms";
import { Skeleton } from "@/components/ui/feedback";
import { getAuthUser } from "@/server/auth/session";
import { safeNextPath } from "@/server/http/request";

export const metadata: Metadata = { title: "Crear cuenta · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Crea tu cuenta</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Después podrás dar de alta tu taller o unirte al de tu equipo.</p>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <SignUpContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SignUpContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next) : undefined;
  if (await getAuthUser()) redirect(next ?? "/app");
  return <SignUpForm next={next} />;
}
