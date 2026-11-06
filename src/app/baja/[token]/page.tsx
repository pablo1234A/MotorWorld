import type { Metadata } from "next";
import { Suspense } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { resolveUnsubscribe, unsubscribe } from "@/server/modules/unsubscribe/service";

export const metadata: Metadata = { title: "Avisos de revisión", robots: { index: false } };

type Params = Promise<{ token: string }>;

async function confirmUnsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "").slice(0, 200);
  await unsubscribe(token);
  const { redirect } = await import("next/navigation");
  redirect(`/baja/${encodeURIComponent(token)}?hecho=1`);
}

export default function UnsubscribePage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <main className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <Content params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Content({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const target = await resolveUnsubscribe(token);
  if (!target) {
    return <Alert tone="error" title="Enlace no válido">Comprueba que has abierto el enlace completo del correo.</Alert>;
  }
  if (target.alreadyOptedOut || sp.hecho) {
    return (
      <Alert tone="success" title="Hecho">
        No volverás a recibir avisos de revisión de {target.workshopName}. Si cambias de idea, díselo al taller.
      </Alert>
    );
  }
  return (
    <form action={confirmUnsubscribe} className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Avisos de {target.workshopName}</h1>
      <p className="text-sm leading-6 text-[var(--muted)]">¿Quieres dejar de recibir los avisos de revisión de tu vehículo por correo?</p>
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Guardando…">No quiero recibir más avisos</SubmitButton>
    </form>
  );
}
