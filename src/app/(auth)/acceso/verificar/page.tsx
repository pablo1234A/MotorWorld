import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { VerifyMfaForm } from "@/components/account/mfa-forms";
import { Skeleton } from "@/components/ui/feedback";
import { getAuthUser, getPendingMfaUser } from "@/server/auth/session";
import { safeNextPath } from "@/server/http/request";
import { signOutAction } from "@/server/modules/auth/actions";

export const metadata: Metadata = { title: "Verificación en dos pasos · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Verificación en dos pasos</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Escribe el código que te muestra tu app de autenticación.</p>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next) : undefined;
  if (await getAuthUser()) redirect(next ?? "/app");
  if (!(await getPendingMfaUser())) redirect("/acceso");
  return (
    <div className="flex flex-col gap-4">
      <VerifyMfaForm next={next} />
      <form action={signOutAction}>
        <button type="submit" className="text-sm font-medium text-[var(--accent)]">
          Entrar con otra cuenta
        </button>
      </form>
      <p className="text-xs text-[var(--muted)]">¿Has perdido el móvil? Pide a otro administrador del taller o al soporte de RevisaYa que te ayude a recuperar el acceso.</p>
    </div>
  );
}
