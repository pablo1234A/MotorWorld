import type { Metadata } from "next";

import { ResendVerificationForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Verifica tu correo · RevisaYa" };

export default function VerifyEmailPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Revisa tu correo</h1>
      <p className="mb-6 text-sm leading-6 text-[var(--muted)]">
        Te hemos enviado un enlace para confirmar tu dirección. Ábrelo para activar la cuenta; puedes hacerlo desde el
        móvil o desde otro ordenador. Si no lo ves, mira en la carpeta de spam.
      </p>
      <ResendVerificationForm />
    </>
  );
}
