import type { Metadata } from "next";
import { Suspense } from "react";

import { NewPasswordForm } from "@/components/auth/auth-forms";
import { Skeleton } from "@/components/ui/feedback";
import { requireUserPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Contraseña nueva · RevisaYa" };

export default function NewPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Crea una contraseña nueva</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Úsala a partir de ahora para entrar en RevisaYa.</p>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <NewPasswordContent />
      </Suspense>
    </>
  );
}

async function NewPasswordContent() {
  // El enlace de recuperación crea una sesión temporal; sin ella no hay nada que cambiar.
  await requireUserPage("/cuenta/nueva-contrasena");
  return <NewPasswordForm />;
}
