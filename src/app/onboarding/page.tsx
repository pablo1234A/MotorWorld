import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CreateOrganizationForm } from "@/components/organizations/create-organization-form";
import { Skeleton } from "@/components/ui/feedback";
import { getOrgContext } from "@/server/auth/context";
import { requireUserPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Da de alta tu taller · RevisaYa" };

export default function OnboardingPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <p className="mb-8 text-xl font-semibold tracking-tight">RevisaYa</p>
      <main className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Da de alta tu taller</h1>
        <p className="mb-6 text-sm leading-6 text-[var(--muted)]">
          Si te han invitado al taller de tu equipo, abre el enlace de la invitación en lugar de crear uno nuevo.
        </p>
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <OnboardingContent />
        </Suspense>
      </main>
    </div>
  );
}

async function OnboardingContent() {
  await requireUserPage("/onboarding");
  if (await getOrgContext()) redirect("/app");
  return <CreateOrganizationForm />;
}
