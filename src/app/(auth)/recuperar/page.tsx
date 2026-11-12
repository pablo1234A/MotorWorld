import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-3xl font-bold">Recupera tu contraseña</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Indica tu correo y te enviaremos un enlace para elegir una contraseña nueva.</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-brand-strong hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </>
  );
}
