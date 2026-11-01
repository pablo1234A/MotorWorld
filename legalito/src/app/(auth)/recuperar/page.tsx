import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ResetPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Recupera tu contraseña</h1>
      <p className="mt-1.5 mb-7 text-[15px] text-muted">Te enviaremos un enlace para crear una nueva contraseña.</p>
      <ResetRequestForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/acceder" className="font-medium text-blue hover:underline">
          Volver a acceder
        </Link>
      </p>
    </>
  );
}
