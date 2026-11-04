import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Recuperar contraseña · RevisaYa" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">¿Has olvidado tu contraseña?</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Te enviaremos un enlace para crear una nueva.</p>
      <ForgotPasswordForm />
    </>
  );
}
