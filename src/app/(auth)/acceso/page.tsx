import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignInForm } from "@/components/auth/auth-forms";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { getAuthUser, getPendingMfaUser } from "@/server/auth/session";
import { safeNextPath } from "@/server/http/request";

export const metadata: Metadata = { title: "Iniciar sesión · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LINK_ERRORS: Record<string, string> = {
  enlace_no_valido: "El enlace no es válido, ha caducado o ya se ha utilizado. Solicita uno nuevo.",
};

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Inicia sesión</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Accede al panel de tu taller.</p>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <SignInContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SignInContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next) : undefined;
  if (await getAuthUser()) redirect(next ?? "/app");
  if (await getPendingMfaUser()) redirect(`/acceso/verificar${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  const error = typeof params.error === "string" ? LINK_ERRORS[params.error] : undefined;
  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <SignInForm next={next} />
    </div>
  );
}
